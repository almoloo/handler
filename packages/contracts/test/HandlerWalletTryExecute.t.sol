// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract HandlerWalletTryExecuteTest is Test {
    HandlerWallet wallet;
    TrustReader trustReader;
    PriceConverter priceConverter;

    address owner = makeAddr("owner");
    address sessionKey = makeAddr("sessionKey");
    address recipient = makeAddr("recipient");
    address router = makeAddr("router");

    uint128 constant ETH_USD8 = 2_000_00000000; // $2,000 / ETH

    function setUp() public {
        vm.startPrank(owner);
        trustReader = new TrustReader(owner);
        priceConverter = new PriceConverter(owner);
        wallet = new HandlerWallet(owner, trustReader, priceConverter);
        priceConverter.setRate(address(0), ETH_USD8, 18);
        vm.stopPrank();

        vm.deal(address(wallet), 100 ether);
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

    function test_TryExecute_TransferHappyPath_ReturnsTrueAndMovesFunds() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        trustReader.setOverride(recipient, Tier.NEW);

        uint256 recipientBefore = recipient.balance;

        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));

        assertTrue(success);
        assertEq(recipient.balance, recipientBefore + 0.01 ether);
    }

    function test_TryExecute_Frozen_EmitsBlockedReturnsFalseNeverReverts() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        wallet.freezeAgent(sessionKey);

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.ExecutionBlocked(sessionKey, HandlerWallet.BlockReason.FROZEN, 0);

        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));

        assertFalse(success);
    }

    function test_TryExecute_UnknownContract_EmitsBlockedReturnsFalse() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.ExecutionBlocked(sessionKey, HandlerWallet.BlockReason.UNKNOWN_CONTRACT, 0);

        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: hex"1234", value: 0}));

        assertFalse(success);
    }

    function test_TryExecute_SwapsNotAllowed_EmitsBlockedReturnsFalse() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, false, false));
        vm.prank(owner);
        wallet.setKnownRouter(router, true);

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.ExecutionBlocked(sessionKey, HandlerWallet.BlockReason.SWAPS_NOT_ALLOWED, 0);

        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: router, data: hex"1234", value: 0}));

        assertFalse(success);
    }

    function test_TryExecute_CounterpartyBelowTier_EmitsBlockedReturnsFalse() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.ExecutionBlocked(sessionKey, HandlerWallet.BlockReason.COUNTERPARTY_BELOW_TIER, 0);

        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));

        assertFalse(success);
    }

    function test_TryExecute_ExceedsPerTxCap_EmitsBlockedReturnsFalse() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        trustReader.setOverride(recipient, Tier.NEW);

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.ExecutionBlocked(sessionKey, HandlerWallet.BlockReason.EXCEEDS_PER_TX_CAP, 400_00000000);

        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.2 ether}));

        assertFalse(success);
    }

    function test_TryExecute_ExceedsDailyAllowance_EmitsBlockedReturnsFalse() public {
        _hire(_policy(50_00000000, 100_00000000, 100_00000000, true, false));
        vm.prank(owner);
        trustReader.setOverride(recipient, Tier.NEW);

        vm.startPrank(sessionKey);
        assertTrue(wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.02 ether}))); // $40

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.ExecutionBlocked(sessionKey, HandlerWallet.BlockReason.EXCEEDS_DAILY_ALLOWANCE, 20_00000000);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether})); // $20
        vm.stopPrank();

        assertFalse(success);
    }

    function test_TryExecute_RequiresCosign_ProposesInsteadOfBlocking() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));
        vm.prank(owner);
        trustReader.setOverride(recipient, Tier.NEW);

        vm.recordLogs();
        vm.prank(sessionKey);
        bool success = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0.03 ether})); // $60

        assertFalse(success, "cosign-required calls must not execute");

        // Must emit Proposed, not ExecutionBlocked.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 proposedTopic = keccak256("Proposed(bytes32,address,address,uint256,uint128)");
        bytes32 blockedTopic = keccak256("ExecutionBlocked(address,uint8,uint128)");
        bool sawProposed;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == blockedTopic) fail("ExecutionBlocked must not be emitted for a cosign case");
            if (logs[i].topics[0] == proposedTopic) sawProposed = true;
        }
        assertTrue(sawProposed, "Proposed must be emitted");

        // Recipient must not have received funds yet - it's pending, not executed.
        assertEq(recipient.balance, 0);
    }

    function test_TryExecute_RevertsIfTargetIsSessionKey() public {
        _hire(_policy(1_000_00000000, 100_00000000, 50_00000000, true, false));

        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.TargetIsSessionKey.selector);
        bool reverted = wallet.tryExecute(HandlerWallet.Call({target: sessionKey, data: "", value: 0}));
        reverted; // unreachable — the call above reverts; silences the unused-return lint note
    }

    function test_TryExecute_RevertsIfCallerNotHired() public {
        vm.prank(sessionKey);
        vm.expectRevert(HandlerWallet.AgentNotHired.selector);
        bool reverted = wallet.tryExecute(HandlerWallet.Call({target: recipient, data: "", value: 0}));
        reverted; // unreachable — the call above reverts; silences the unused-return lint note
    }
}
