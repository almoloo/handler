// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Tier, ITrustReader} from "../../src/interfaces/ITrustReader.sol";

/// @notice Test-only ITrustReader double: a directly settable tier map, so
/// HandlerWallet's policy/execute/cosign/epoch tests can exercise wallet logic against a
/// controllable tier without depending on real ERC-8004 registry behavior (that's
/// TrustReader.t.sol's job). Never used outside test/ — see coding-standards.md's
/// no-mock-data-in-runtime-code rule.
contract MockTrustReader is ITrustReader {
    mapping(address account => Tier tier) private tiers;

    function setTier(address account, Tier tier) external {
        tiers[account] = tier;
    }

    function tierOf(address account) external view returns (Tier) {
        return tiers[account];
    }
}
