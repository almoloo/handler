// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {MockTrustReader} from "./mocks/MockTrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract HandlerWalletExecuteTest is Test {
    HandlerWallet wallet;
    MockTrustReader trustReader;
    PriceConverter priceConverter;

    address owner = makeAddr("owner");
    address sessionKey = makeAddr("sessionKey");
    address recipient = makeAddr("recipient");
    address router = makeAddr("router");

    uint128 constant ETH_USD8 = 2_000_00000000; // $2,000 / ETH

    function setUp() public {
        vm.startPrank(owner);
        trustReader = new MockTrustReader();
        priceConverter = new PriceConverter(owner);
        wallet = new HandlerWallet(owner, trustReader, priceConverter);
        // maxStaleness is unbounded here: this file tests wallet policy logic, not
        // PriceConverter's own staleness behavior (that's PriceConverter.t.sol's job), and
        // some of these tests vm.warp forward.
        priceConverter.setFeed(address(0), new MockV3Aggregator(8, int256(uint256(ETH_USD8))), 18, type(uint256).max);
        vm.stopPrank();

        vm.deal(address(wallet), 100 ether);
        vm.deal(sessionKey, 0);
    }

    function _policy(
        uint128 dailyCapUsd,
        uint128 perTxCapUsd,
        uint128 cosignAboveUsd,
        bool allowSwaps,
        bool allowUnknown
    ) internal pure returns (HandlerWallet.AgentPolicy memory) {
        return HandlerWallet.AgentPolicy({
            dailyCapUsd: dailyCapUsd,
            perTxCapUsd: perTxCapUsd,
            cosignAboveUsd: cosignAboveUsd,
            epochStart: 0,
            spentThisEpoch: 0,
            minCounterpartyTier: Tier.NEW,
            allowSwaps: allowSwaps,
            allowUnknownContracts: allowUnknown,
            frozen: false
        });
    }

    function _hire(HandlerWallet.AgentPolicy memory policy) internal {
        vm.prank(owner);
        wallet.hireAgent(sessionKey, policy);
    }

    function _spentThisEpoch() internal view returns (uint128 spent) {
        (,,,, spent,,,,) = wallet.policies(sessionKey);
    }

    // -- happy path ----------------------------------------------------

    function test_Execute_TransferHappyPath_UpdatesSpendAndMovesFunds() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        trustReader.setTier(recipient, Tier.NEW);

        uint256 recipientBefore = recipient.balance;

        vm.expectEmit(true, true, false, true, address(wallet));
        emit HandlerWallet.Executed(sessionKey, recipient, 20_00000000, HandlerWallet.CallKind.TRANSFER);

        vm.prank(sessionKey);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));

        assertEq(recipient.balance, recipientBefore + 0.01 ether);
        assertEq(_spentThisEpoch(), 20_00000000);
    }

    // -- one test per custom error --------------------------------------

    function test_Execute_RevertsIfFrozen() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        wallet.freezeAgent(sessionKey);

        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.AgentIsFrozen.selector);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));
    }

    function test_Execute_RevertsOnUnknownContract() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));

        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.UnknownContractBlocked.selector);
        wallet.execute(HandlerWallet.Call({target: recipient, data: hex"1234", value: 0}));
    }

    function test_Execute_RevertsOnSwapsNotAllowed() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, false, false));
        vm.prank(owner);
        wallet.setKnownRouter(router, true);

        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.SwapsNotAllowed.selector);
        wallet.execute(HandlerWallet.Call({target: router, data: hex"1234", value: 0}));
    }

    function test_Execute_RevertsOnCounterpartyBelowTier() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        // recipient never registered -> defaults to FLAGGED, below the policy's NEW requirement.

        vm.prank(sessionKey);
        vm.expectRevert(
            abi.encodeWithSelector(HandlerWallet.CounterpartyBelowTier.selector, recipient, Tier.FLAGGED, Tier.NEW)
        );
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));
    }

    function test_Execute_RevertsOnExceedsPerTxCap() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        trustReader.setTier(recipient, Tier.NEW);

        // 0.2 ETH = $400 > $100 per-tx cap.
        vm.prank(sessionKey);
        vm.expectRevert(abi.encodeWithSelector(HandlerWallet.ExceedsPerTxCap.selector, 400_00000000, 100_00000000));
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.2 ether}));
    }

    function test_Execute_RevertsOnExceedsDailyAllowance() public {
        // dailyCap $50, perTxCap/cosign raised so only the daily check can fail.
        _hire(_policy(50_00000000, 100_00000000, 100_00000000, true, false));
        vm.prank(owner);
        trustReader.setTier(recipient, Tier.NEW);

        vm.startPrank(sessionKey);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.02 ether})); // $40, ok
        assertEq(_spentThisEpoch(), 40_00000000);

        vm.expectRevert(abi.encodeWithSelector(HandlerWallet.ExceedsDailyAllowance.selector, 20_00000000, 10_00000000));
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether})); // $20, only $10 left
        vm.stopPrank();
    }

    function test_Execute_RevertsRequiresCosignAboveThreshold() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        trustReader.setTier(recipient, Tier.NEW);

        // 0.03 ETH = $60: under the $100 per-tx cap and $1,000 daily cap, but over the $50 cosign threshold.
        vm.prank(sessionKey);
        vm.expectRevert(abi.encodeWithSelector(HandlerWallet.RequiresCosign.selector, bytes32(0)));
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.03 ether}));
    }

    function test_Execute_RevertsIfTargetIsSessionKey() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));

        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.TargetIsSessionKey.selector);
        wallet.execute(HandlerWallet.Call({target: sessionKey, data: "", value: 0}));
    }

    function test_Execute_RevertsIfCallerNotHired() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.AgentNotHired.selector);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0}));
    }
}
