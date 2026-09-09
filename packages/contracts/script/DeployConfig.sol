// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Shared config constants for `DeployDev.s.sol` and `DeployBase.s.sol` — both scripts
/// deploy the same real ERC-8004 registries and Chainlink feeds (anvil forks Base mainnet, so
/// the addresses are identical whether the broadcast lands on the fork or the real chain), so
/// this is the one place to update either set rather than two.
abstract contract DeployConfig {
    /// @dev Real ERC-8004 registries, same address on every chain they're deployed to
    /// (incl. Base mainnet) — see packages/contracts/src/interfaces/erc8004/*.sol.
    address constant IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REPUTATION_REGISTRY = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    /// @dev Real Chainlink feeds on Base mainnet, verified via description()/decimals() before
    /// writing this config (see context/current-feature.md's "Move the public deployment to
    /// Base mainnet" fix). ETH_USD_FEED backs native ETH (address(0)); USDC is Base's native
    /// USDC. Without these, every tryExecute() reverts FeedNotSet(address(0)) before checking
    /// anything.
    ///
    /// Staleness windows are sized per feed's actual on-chain cadence, not a single guessed
    /// number: ETH/USD is deviation-triggered and moved every ~1-15 min in the rounds checked
    /// (~810s worst gap), so 1 hour is a several-x buffer. USDC/USD is a stablecoin feed with a
    /// ~24h heartbeat (5 consecutive rounds checked: 86406-86420s apart) — a 1-hour window would
    /// make every USDC valuation revert StalePrice almost permanently, since the feed is
    /// *usually* older than that by design.
    address constant ETH_USD_FEED = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    uint256 constant ETH_MAX_STALENESS = 1 hours;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant USDC_USD_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;
    uint256 constant USDC_MAX_STALENESS = 26 hours;
}
