// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {MockTrustReader} from "./mocks/MockTrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract HandlerWalletEpochAndInvariantsTest is Test {
    HandlerWallet wallet;
    MockTrustReader trustReader;
    PriceConverter priceConverter;

    address owner = makeAddr("owner");
    address sessionKey = makeAddr("sessionKey");
    address recipient = makeAddr("recipient");

    uint128 constant ETH_USD8 = 2_000_00000000; // $2,000 / ETH

    function setUp() public {
        vm.startPrank(owner);
        trustReader = new MockTrustReader();
        priceConverter = new PriceConverter(owner);
        wallet = new HandlerWallet(owner, trustReader, priceConverter);
        // maxStaleness is unbounded here: this file tests wallet policy logic (including
        // vm.warp-heavy epoch/invariant fuzzing), not PriceConverter's own staleness behavior
        // (that's PriceConverter.t.sol's job).
        priceConverter.setFeed(address(0), new MockV3Aggregator(8, int256(uint256(ETH_USD8))), 18, type(uint256).max);
        trustReader.setTier(recipient, Tier.NEW);

        wallet.hireAgent(
            sessionKey,
            HandlerWallet.AgentPolicy({
                dailyCapUsd: 1_000_00000000,
                perTxCapUsd: 1_000_00000000,
                cosignAboveUsd: 1_000_00000000,
                epochStart: 0,
                spentThisEpoch: 0,
                minCounterpartyTier: Tier.NEW,
                allowSwaps: true,
                allowUnknownContracts: false,
                frozen: false
            })
        );
        vm.stopPrank();

        vm.deal(address(wallet), 100 ether);
    }

    function _epoch() internal view returns (uint64 epochStart, uint128 spent) {
        (,,, epochStart, spent,,,,) = wallet.policies(sessionKey);
    }

    function _spendTenDollars() internal {
        vm.prank(sessionKey);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.005 ether})); // $10
    }

    // -- epoch-boundary tests --------------------------------------------

    function test_EpochDoesNotRollAtExactly24Hours() public {
        (uint64 t0,) = _epoch();
        _spendTenDollars();

        vm.warp(t0 + 1 days); // exactly the boundary: `>` is false, so this must NOT roll
        _spendTenDollars();

        (uint64 epochStart, uint128 spent) = _epoch();
        assertEq(epochStart, t0, "epoch must not roll at exactly 24h");
        assertEq(spent, 20_00000000, "spend must accumulate within the same epoch");
    }

    function test_EpochRollsJustAfter24Hours() public {
        (uint64 t0,) = _epoch();
        _spendTenDollars();

        vm.warp(t0 + 1 days + 1); // one second past the boundary: must roll
        _spendTenDollars();

        (uint64 epochStart, uint128 spent) = _epoch();
        assertEq(epochStart, t0 + 1 days + 1, "epoch must roll to the new tx's timestamp");
        assertEq(spent, 10_00000000, "spend must reset to only the new epoch's tx");
    }

    function testFuzz_SpentNeverExceedsDailyCap(uint8 numTx, uint256 seed) public {
        numTx = uint8(bound(numTx, 1, 12));

        for (uint256 i = 0; i < numTx; i++) {
            uint256 warp = uint256(keccak256(abi.encode(seed, i, "warp"))) % 2 days;
            // Bound each send so its USD value never exceeds the $1,000 per-tx cap on its own,
            // isolating the property under test to the daily-cap invariant, not the per-tx cap.
            uint256 sendWei = uint256(keccak256(abi.encode(seed, i, "send"))) % (0.5 ether + 1);

            vm.warp(block.timestamp + warp);
            vm.prank(sessionKey);
            wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: sendWei}));

            (, uint128 spent) = _epoch();
            assertLe(spent, 1_000_00000000, "spentThisEpoch must never exceed dailyCapUsd");
        }
    }

    // -- session-key invariant: never reachable to change policy or self-target ------------

    function test_Invariant_SessionKeyCannotCallUpdatePolicy() public {
        vm.prank(sessionKey);
        vm.expectRevert();
        wallet.updatePolicy(sessionKey, HandlerWallet.AgentPolicy(0, 0, 0, 0, 0, Tier.FLAGGED, false, false, false));
    }

    function test_Invariant_SessionKeyCannotCallHireAgent() public {
        vm.prank(sessionKey);
        vm.expectRevert();
        wallet.hireAgent(sessionKey, HandlerWallet.AgentPolicy(0, 0, 0, 0, 0, Tier.FLAGGED, false, false, false));
    }

    function test_Invariant_SessionKeyCannotCallFreezeAgent() public {
        vm.prank(sessionKey);
        vm.expectRevert();
        wallet.freezeAgent(sessionKey);
    }

    function test_Invariant_ExecuteRejectsSelfTarget() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.TargetIsSessionKey.selector);
        wallet.execute(HandlerWallet.Call({target: sessionKey, data: "", value: 0}));
    }

    function test_Invariant_TryExecuteRejectsSelfTarget() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.TargetIsSessionKey.selector);
        wallet.tryExecute(HandlerWallet.Call({target: sessionKey, data: "", value: 0}));
    }

    function test_Invariant_ProposeRejectsSelfTarget() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.TargetIsSessionKey.selector);
        wallet.propose(HandlerWallet.Call({target: sessionKey, data: "", value: 0}));
    }

    // -- zero-address target guard ---------------------------------------
    // A policy with the loosest trust floor (FLAGGED) would otherwise let a session key
    // burn funds to address(0), since unregistered addresses default to FLAGGED too.

    function test_Invariant_ExecuteRejectsZeroAddressTarget() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.InvalidTarget.selector);
        wallet.execute(HandlerWallet.Call({target: address(0), data: "", value: 0}));
    }

    function test_Invariant_TryExecuteRejectsZeroAddressTarget() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.InvalidTarget.selector);
        wallet.tryExecute(HandlerWallet.Call({target: address(0), data: "", value: 0}));
    }

    function test_Invariant_ProposeRejectsZeroAddressTarget() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.InvalidTarget.selector);
        wallet.propose(HandlerWallet.Call({target: address(0), data: "", value: 0}));
    }
}
