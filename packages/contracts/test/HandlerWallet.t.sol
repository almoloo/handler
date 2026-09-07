// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract HandlerWalletTest is Test {
    HandlerWallet wallet;
    TrustReader trustReader;
    PriceConverter priceConverter;

    address owner = makeAddr("owner");
    address sessionKey = makeAddr("sessionKey");

    function setUp() public {
        vm.startPrank(owner);
        trustReader = new TrustReader(owner);
        priceConverter = new PriceConverter(owner);
        wallet = new HandlerWallet(owner, trustReader, priceConverter);
        vm.stopPrank();
    }

    function _defaultPolicy() internal pure returns (HandlerWallet.AgentPolicy memory) {
        return HandlerWallet.AgentPolicy({
            dailyCapUsd: 50_00000000,
            perTxCapUsd: 25_00000000,
            cosignAboveUsd: 25_00000000,
            epochStart: 0,
            spentThisEpoch: 0,
            minCounterpartyTier: Tier.NEW,
            allowSwaps: true,
            allowUnknownContracts: false,
            frozen: false
        });
    }

    function test_HireAgent_StoresPolicyAndEmits() public {
        HandlerWallet.AgentPolicy memory policy = _defaultPolicy();

        // hireAgent stamps epochStart to "now" regardless of the input, so the expected
        // emitted payload must reflect that, not the raw input policy.
        HandlerWallet.AgentPolicy memory expected = policy;
        expected.epochStart = uint64(block.timestamp);

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.AgentHired(sessionKey, expected);

        vm.prank(owner);
        wallet.hireAgent(sessionKey, policy);

        assertTrue(wallet.isHired(sessionKey));
        (uint128 dailyCapUsd, uint128 perTxCapUsd, uint128 cosignAboveUsd,, uint128 spentThisEpoch,,,, bool frozen) =
            wallet.policies(sessionKey);
        assertEq(dailyCapUsd, policy.dailyCapUsd);
        assertEq(perTxCapUsd, policy.perTxCapUsd);
        assertEq(cosignAboveUsd, policy.cosignAboveUsd);
        assertEq(spentThisEpoch, 0);
        assertFalse(frozen);
    }

    function test_HireAgent_RevertsForNonOwner() public {
        vm.expectRevert();
        wallet.hireAgent(sessionKey, _defaultPolicy());
    }

    function test_UpdatePolicy_ChangesCapsPreservesEpochAndFrozen() public {
        vm.startPrank(owner);
        wallet.hireAgent(sessionKey, _defaultPolicy());
        wallet.freezeAgent(sessionKey);

        HandlerWallet.AgentPolicy memory updated = _defaultPolicy();
        updated.dailyCapUsd = 100_00000000;

        // updatePolicy preserves epoch accounting and freeze state from the existing stored
        // policy, so the expected emitted payload must reflect those, not the raw input.
        HandlerWallet.AgentPolicy memory expected = updated;
        expected.epochStart = uint64(block.timestamp);
        expected.frozen = true;

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.PolicyUpdated(sessionKey, expected);
        wallet.updatePolicy(sessionKey, updated);
        vm.stopPrank();

        (uint128 dailyCapUsd,,,,,,,, bool frozen) = wallet.policies(sessionKey);
        assertEq(dailyCapUsd, 100_00000000);
        assertTrue(frozen, "updatePolicy must not clear an existing freeze");
    }

    function test_UpdatePolicy_RevertsIfNotHired() public {
        vm.prank(owner);
        vm.expectRevert(HandlerWallet.AgentNotHired.selector);
        wallet.updatePolicy(sessionKey, _defaultPolicy());
    }

    function test_FreezeAndUnfreezeAgent() public {
        vm.startPrank(owner);
        wallet.hireAgent(sessionKey, _defaultPolicy());

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.AgentFrozen(sessionKey, true);
        wallet.freezeAgent(sessionKey);
        (,,,,,,,, bool frozenAfterFreeze) = wallet.policies(sessionKey);
        assertTrue(frozenAfterFreeze);

        vm.expectEmit(true, false, false, true, address(wallet));
        emit HandlerWallet.AgentFrozen(sessionKey, false);
        wallet.unfreezeAgent(sessionKey);
        (,,,,,,,, bool frozenAfterUnfreeze) = wallet.policies(sessionKey);
        assertFalse(frozenAfterUnfreeze);
        vm.stopPrank();
    }

    function test_FreezeAgent_RevertsIfNotHired() public {
        vm.prank(owner);
        vm.expectRevert(HandlerWallet.AgentNotHired.selector);
        wallet.freezeAgent(sessionKey);
    }
}
