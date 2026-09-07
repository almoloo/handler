// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal slice of the deployed ERC-8004 Reputation Registry that TrustReader
/// calls. Full contract: `erc-8004/erc-8004-contracts`, `contracts/ReputationRegistryUpgradeable.sol`.
/// Deployed (same address across every chain it's live on, incl. Base mainnet) at
/// 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 — see that repo's README "Contract Addresses".
interface IReputationRegistry {
    /// @notice All non-revoked feedback for `agentId` from every tracked client (pass an
    /// empty `clientAddresses` to get the registry's own "all clients" branch — this is
    /// the only aggregate read that doesn't require the caller to supply a client
    /// allowlist, which would otherwise let the caller cherry-pick which feedback counts).
    /// `values[i]` is fixed-point with `valueDecimals[i]` decimals (WAD-style per-entry,
    /// not pre-normalized — the caller normalizes before averaging).
    function readAllFeedback(
        uint256 agentId,
        address[] calldata clientAddresses,
        string calldata tag1,
        string calldata tag2,
        bool includeRevoked
    )
        external
        view
        returns (
            address[] memory clients,
            uint64[] memory feedbackIndexes,
            int128[] memory values,
            uint8[] memory valueDecimals,
            string[] memory tag1s,
            string[] memory tag2s,
            bool[] memory revokedStatuses
        );
}
