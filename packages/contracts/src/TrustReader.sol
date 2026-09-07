// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Tier, ITrustReader} from "./interfaces/ITrustReader.sol";
import {IIdentityRegistry} from "./interfaces/erc8004/IIdentityRegistry.sol";
import {IReputationRegistry} from "./interfaces/erc8004/IReputationRegistry.sol";

/// @notice Read-only trust source behind the ITrustReader interface: resolves a
/// counterparty address to a Tier purely from the real ERC-8004 Identity + Reputation
/// registries. No owner, no override — the only mutating entrypoint (`syncAgent`) is
/// permissionless and only ever caches a fact it just read from the canonical registry.
/// @dev The Identity Registry has no on-chain address -> agentId lookup (agentId ->
/// wallet is one-way), so this contract keeps a small cache warmed by `syncAgent`.
/// Known limitation: if a synced agent's real registry wallet later changes, the cache
/// is stale until `syncAgent` is called again for the new mapping — see
/// context/contracts-roadmap.md §2.2.
contract TrustReader is ITrustReader {
    IIdentityRegistry public immutable identityRegistry;
    IReputationRegistry public immutable reputationRegistry;

    /// @dev Feedback values are assumed given on a 0-100 scale by convention (ERC-8004
    /// itself does not mandate one). Public so the backend `trust/` module (which must
    /// mirror these exact numbers per contracts-roadmap.md §2.2) can read them directly
    /// instead of hand-copying magic numbers that could silently drift.
    int256 private constant SCALE_WAD = 1e18;
    int256 public constant VERIFIED_MIN_SCORE_WAD = 80 * SCALE_WAD;
    uint256 public constant VERIFIED_MIN_FEEDBACK_COUNT = 3;

    mapping(address account => uint256 agentId) private agentIdOf;
    mapping(address account => bool isSynced) private synced;

    event AgentSynced(address indexed wallet, uint256 indexed agentId);

    constructor(IIdentityRegistry identityRegistry_, IReputationRegistry reputationRegistry_) {
        identityRegistry = identityRegistry_;
        reputationRegistry = reputationRegistry_;
    }

    /// @notice Permissionless cache warm: re-checks the real Identity Registry for
    /// `agentId`'s current wallet and caches it. Anyone may call this for any agentId —
    /// it only ever records what the canonical registry itself says right now.
    function syncAgent(uint256 agentId) external {
        address wallet = identityRegistry.getAgentWallet(agentId);
        if (wallet == address(0)) return;
        agentIdOf[wallet] = agentId;
        synced[wallet] = true;
        emit AgentSynced(wallet, agentId);
    }

    function tierOf(address account) external view returns (Tier) {
        if (!synced[account]) return Tier.FLAGGED;

        (uint256 count, int256 averageWad, bool ok) = _averageFeedback(agentIdOf[account]);
        if (!ok) return Tier.FLAGGED;
        if (count >= VERIFIED_MIN_FEEDBACK_COUNT && averageWad >= VERIFIED_MIN_SCORE_WAD) {
            return Tier.VERIFIED;
        }
        return Tier.NEW;
    }

    function _averageFeedback(uint256 agentId) private view returns (uint256 count, int256 averageWad, bool ok) {
        try reputationRegistry.readAllFeedback(agentId, new address[](0), "", "", false) returns (
            address[] memory,
            uint64[] memory,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory,
            string[] memory,
            bool[] memory
        ) {
            if (values.length == 0) return (0, 0, true);
            int256 sumWad;
            for (uint256 i; i < values.length; i++) {
                int256 factor = int256(10 ** uint256(18 - valueDecimals[i]));
                sumWad += int256(values[i]) * factor;
            }
            return (values.length, sumWad / int256(values.length), true);
        } catch {
            return (0, 0, false);
        }
    }
}
