// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {MockTrustReader} from "./mocks/MockTrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract HandlerWalletCosignTest is Test {
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
        // maxStaleness is unbounded here: this file tests wallet policy logic, not
        // PriceConverter's own staleness behavior (that's PriceConverter.t.sol's job), and
        // some of these tests vm.warp forward.
        priceConverter.setFeed(address(0), new MockV3Aggregator(8, int256(uint256(ETH_USD8))), 18, type(uint256).max);
        trustReader.setTier(recipient, Tier.NEW);

        HandlerWallet.AgentPolicy memory policy = HandlerWallet.AgentPolicy({
            dailyCapUsd: 1_000_00000000,
            perTxCapUsd: 100_00000000,
            cosignAboveUsd: 50_00000000,
            epochStart: 0,
            spentThisEpoch: 0,
            minCounterpartyTier: Tier.NEW,
            allowSwaps: true,
            allowUnknownContracts: false,
            frozen: false
        });
        wallet.hireAgent(sessionKey, policy);
        vm.stopPrank();

        vm.deal(address(wallet), 100 ether);
    }

    function _spentThisEpoch() internal view returns (uint128 spent) {
        (,,,, spent,,,,) = wallet.policies(sessionKey);
    }

    function _proposeSixtyDollars() internal returns (bytes32 id) {
        vm.recordLogs();
        vm.prank(sessionKey);
        id = wallet.propose(HandlerWallet.Call({target: recipient, data: "", value: 0.03 ether})); // $60
    }

    function test_Propose_StoresApprovalAndEmits() public {
        vm.expectEmit(true, true, false, true, address(wallet));
        emit HandlerWallet.Proposed(
            keccak256(
                abi.encode(sessionKey, recipient, bytes(""), uint256(0.03 ether), uint128(60_00000000), uint256(0))
            ),
            sessionKey,
            recipient,
            0.03 ether,
            60_00000000
        );

        bytes32 id = _proposeSixtyDollars();
        assertTrue(id != bytes32(0));
    }

    function test_Propose_RevertsIfTargetIsSessionKey() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.TargetIsSessionKey.selector);
        wallet.propose(HandlerWallet.Call({target: sessionKey, data: "", value: 0}));
    }

    function test_Propose_RevertsForGenuinePolicyBlock() public {
        vm.prank(owner);
        wallet.freezeAgent(sessionKey);

        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.AgentIsFrozen.selector);
        wallet.propose(HandlerWallet.Call({target: recipient, data: "", value: 0.03 ether}));
    }

    function test_ApproveResolvesAndExecutesTheStoredCall() public {
        bytes32 id = _proposeSixtyDollars();
        uint256 recipientBefore = recipient.balance;

        vm.expectEmit(true, false, false, false, address(wallet));
        emit HandlerWallet.Approved(id);

        vm.prank(owner);
        wallet.approve(id);

        assertEq(recipient.balance, recipientBefore + 0.03 ether, "approved call must move the funds");
        assertEq(_spentThisEpoch(), 60_00000000, "approved spend counts against the daily allowance");
    }

    function test_Approve_EmitsExecutedWithSwapKindForRouterProposal() public {
        address router = makeAddr("router");
        vm.prank(owner);
        wallet.setKnownRouter(router, true);
        vm.prank(owner);
        trustReader.setTier(router, Tier.NEW);

        vm.prank(sessionKey);
        bytes32 id = wallet.propose(HandlerWallet.Call({target: router, data: hex"1234", value: 0.03 ether})); // $60

        vm.expectEmit(true, true, false, true, address(wallet));
        emit HandlerWallet.Executed(sessionKey, router, 60_00000000, HandlerWallet.CallKind.SWAP);

        vm.prank(owner);
        wallet.approve(id);
    }

    function test_Approve_RevertsIfNotOwner() public {
        bytes32 id = _proposeSixtyDollars();
        vm.expectRevert();
        wallet.approve(id);
    }

    function test_Approve_RevertsIfNotFound() public {
        vm.prank(owner);
        vm.expectRevert(HandlerWallet.ApprovalNotFound.selector);
        wallet.approve(bytes32(uint256(1)));
    }

    function test_Approve_RevertsIfAlreadyResolved() public {
        bytes32 id = _proposeSixtyDollars();
        vm.startPrank(owner);
        wallet.approve(id);

        vm.expectRevert(HandlerWallet.ApprovalAlreadyResolved.selector);
        wallet.approve(id);
        vm.stopPrank();
    }

    function test_Approve_RevertsIfNowExceedsDailyAllowance() public {
        bytes32 id = _proposeSixtyDollars();

        // Raise the per-tx cap so a single ordinary transfer can spend most of the daily cap
        // before the pending approval is resolved (the daily cap itself is unchanged).
        vm.startPrank(owner);
        HandlerWallet.AgentPolicy memory raisedPerTxCap = HandlerWallet.AgentPolicy({
            dailyCapUsd: 1_000_00000000,
            perTxCapUsd: 1_000_00000000,
            cosignAboveUsd: 1_000_00000000,
            epochStart: 0,
            spentThisEpoch: 0,
            minCounterpartyTier: Tier.NEW,
            allowSwaps: true,
            allowUnknownContracts: false,
            frozen: false
        });
        wallet.updatePolicy(sessionKey, raisedPerTxCap);
        vm.stopPrank();

        vm.prank(sessionKey);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.48 ether})); // $960
        assertEq(_spentThisEpoch(), 960_00000000);

        // $960 + $60 = $1,020 > $1,000 daily cap.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(HandlerWallet.ExceedsDailyAllowance.selector, 60_00000000, 40_00000000));
        wallet.approve(id);
    }

    function test_DenyResolvesWithoutExecuting() public {
        bytes32 id = _proposeSixtyDollars();
        uint256 recipientBefore = recipient.balance;

        vm.expectEmit(true, false, false, false, address(wallet));
        emit HandlerWallet.Denied(id);

        vm.prank(owner);
        wallet.deny(id);

        assertEq(recipient.balance, recipientBefore, "denied call must not move funds");
        assertEq(_spentThisEpoch(), 0, "denied call must not count against the daily allowance");
    }

    function test_Deny_RevertsIfAlreadyResolved() public {
        bytes32 id = _proposeSixtyDollars();
        vm.startPrank(owner);
        wallet.deny(id);

        vm.expectRevert(HandlerWallet.ApprovalAlreadyResolved.selector);
        wallet.deny(id);
        vm.stopPrank();
    }

    function test_Deny_RevertsIfNotOwner() public {
        bytes32 id = _proposeSixtyDollars();
        vm.expectRevert();
        wallet.deny(id);
    }
}
