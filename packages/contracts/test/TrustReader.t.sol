// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";
import {IIdentityRegistry} from "../src/interfaces/erc8004/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/erc8004/IReputationRegistry.sol";

/// @dev Mocks the real ERC-8004 Identity Registry's one relevant function, with a
/// revert switch for the "registry call fails" coverage case.
contract MockIdentityRegistry is IIdentityRegistry {
    mapping(uint256 agentId => address wallet) public wallets;
    bool public shouldRevert;

    function setWallet(uint256 agentId, address wallet) external {
        wallets[agentId] = wallet;
    }

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        if (shouldRevert) revert("mock: identity registry unavailable");
        return wallets[agentId];
    }
}

/// @dev Mocks the real ERC-8004 Reputation Registry's readAllFeedback, with a settable
/// feedback list per agentId and a revert switch.
contract MockReputationRegistry is IReputationRegistry {
    mapping(uint256 agentId => int128[]) private values;
    mapping(uint256 agentId => uint8[]) private decimals;
    bool public shouldRevert;

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function addFeedback(uint256 agentId, int128 value, uint8 valueDecimals) external {
        values[agentId].push(value);
        decimals[agentId].push(valueDecimals);
    }

    function readAllFeedback(uint256 agentId, address[] calldata, string calldata, string calldata, bool)
        external
        view
        returns (
            address[] memory,
            uint64[] memory,
            int128[] memory,
            uint8[] memory,
            string[] memory,
            string[] memory,
            bool[] memory
        )
    {
        if (shouldRevert) revert("mock: reputation registry unavailable");
        // Only `values`/`valueDecimals` feed TrustReader's aggregation — the other five
        // fields are unused by it, so this mock returns them empty rather than n-sized.
        return (
            new address[](0),
            new uint64[](0),
            values[agentId],
            decimals[agentId],
            new string[](0),
            new string[](0),
            new bool[](0)
        );
    }
}

contract TrustReaderTest is Test {
    TrustReader trustReader;
    MockIdentityRegistry identityRegistry;
    MockReputationRegistry reputationRegistry;

    address agentWallet = makeAddr("agentWallet");
    uint256 constant AGENT_ID = 1;

    function setUp() public {
        identityRegistry = new MockIdentityRegistry();
        reputationRegistry = new MockReputationRegistry();
        trustReader = new TrustReader(identityRegistry, reputationRegistry);
    }

    function test_UnsyncedAddressDefaultsToFlagged() public view {
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.FLAGGED));
    }

    function test_SyncAgent_IsPermissionless() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        vm.prank(makeAddr("anyoneAtAll"));
        trustReader.syncAgent(AGENT_ID);
        // No feedback yet, but synced -> NEW, not FLAGGED.
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));
    }

    function test_SyncAgent_UnregisteredAgentId_LeavesUnsynced() public {
        // getAgentWallet returns address(0) for a never-registered agentId.
        trustReader.syncAgent(AGENT_ID);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.FLAGGED));
    }

    function test_SyncedWithNoFeedback_IsNew() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));
    }

    function test_SyncedWithLowFeedback_IsNew() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        reputationRegistry.addFeedback(AGENT_ID, 40, 0); // below the VERIFIED score threshold
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));
    }

    function test_SyncedWithFewHighFeedback_IsNew() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        reputationRegistry.addFeedback(AGENT_ID, 100, 0);
        reputationRegistry.addFeedback(AGENT_ID, 100, 0); // count below VERIFIED_MIN_FEEDBACK_COUNT (3)
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));
    }

    function test_SyncedWithEnoughHighFeedback_IsVerified() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        reputationRegistry.addFeedback(AGENT_ID, 90, 0);
        reputationRegistry.addFeedback(AGENT_ID, 85, 0);
        reputationRegistry.addFeedback(AGENT_ID, 95, 0);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.VERIFIED));
    }

    function test_MalformedValueDecimalsEntry_ExcludedNotReverted_StillVerified() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        reputationRegistry.addFeedback(AGENT_ID, 90, 0);
        reputationRegistry.addFeedback(AGENT_ID, 85, 0);
        reputationRegistry.addFeedback(AGENT_ID, 95, 0);
        // A hostile/malformed entry (decimals > 18) would underflow `10 ** (18 -
        // decimals)` if not excluded — this must not revert tierOf(), and must not be
        // counted toward the average or the VERIFIED feedback-count threshold.
        reputationRegistry.addFeedback(AGENT_ID, 1, 19);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.VERIFIED));
    }

    function test_ValueDecimalsExactly18_IsIncludedNotSkipped() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        // The exclusion is `> 18`, so 18 itself must still count — 10 ** (18 - 18) == 1,
        // no underflow. Using it for all 3 entries at the VERIFIED score proves both that
        // it isn't skipped (count reaches VERIFIED_MIN_FEEDBACK_COUNT) and that its
        // contribution to the average is correctly scaled (still resolves VERIFIED).
        reputationRegistry.addFeedback(AGENT_ID, 90e18, 18);
        reputationRegistry.addFeedback(AGENT_ID, 85e18, 18);
        reputationRegistry.addFeedback(AGENT_ID, 95e18, 18);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.VERIFIED));
    }

    function test_AllFeedbackMalformed_ResolvesToNew_NotReverted() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        reputationRegistry.addFeedback(AGENT_ID, 100, 19);
        reputationRegistry.addFeedback(AGENT_ID, 100, 255);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));
    }

    function test_ReputationRegistryReverting_ResolvesToFlagged_NotBubbledRevert() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        reputationRegistry.setShouldRevert(true);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.FLAGGED));
    }

    function test_IdentityRegistryReverting_SyncAgentReverts_ExistingCacheUntouched() public {
        identityRegistry.setWallet(AGENT_ID, agentWallet);
        trustReader.syncAgent(AGENT_ID);
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));

        identityRegistry.setShouldRevert(true);
        vm.expectRevert();
        trustReader.syncAgent(AGENT_ID);
        // A failed re-sync doesn't wipe the last-known-good cache entry.
        assertEq(uint8(trustReader.tierOf(agentWallet)), uint8(Tier.NEW));
    }
}

/// @notice Fork test against the real deployed ERC-8004 registries on Base mainnet.
/// Skips cleanly if BASE_RPC_URL isn't set (matches docker-compose.yml's anvil fork,
/// which already sources this var for the same purpose).
contract TrustReaderForkTest is Test {
    // Real deployed registries — see src/interfaces/erc8004/*.sol for source/verification.
    address constant IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REPUTATION_REGISTRY = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    function testFork_SyncAndTierOf_AgainstRealRegistries() public {
        string memory rpcUrl = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            return;
        }
        vm.createSelectFork(rpcUrl);

        TrustReader trustReader =
            new TrustReader(IIdentityRegistry(IDENTITY_REGISTRY), IReputationRegistry(REPUTATION_REGISTRY));

        // agentId 0 is the first ever registered agent on the real registry (if any wallet
        // was ever registered) — this just proves the real call path resolves without
        // reverting; it does not assert a specific tier, since real reputation data can
        // change over time.
        trustReader.syncAgent(0);
    }
}
