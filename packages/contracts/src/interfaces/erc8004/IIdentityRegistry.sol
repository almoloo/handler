// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal slice of the deployed ERC-8004 Identity Registry that TrustReader
/// calls. Full contract: `erc-8004/erc-8004-contracts`, `contracts/IdentityRegistryUpgradeable.sol`.
/// Deployed (same address across every chain it's live on, incl. Base mainnet) at
/// 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 — see that repo's README "Contract Addresses".
interface IIdentityRegistry {
    /// @notice The wallet currently registered for `agentId` (the ERC-721 tokenId), or
    /// address(0) if unset/never registered. One-way only — there is no reverse
    /// (wallet -> agentId) lookup on this registry.
    function getAgentWallet(uint256 agentId) external view returns (address);
}
