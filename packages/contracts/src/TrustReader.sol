// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Tier, ITrustReader} from "./interfaces/ITrustReader.sol";

/// @notice Stub trust source: an owner-settable override map behind the ITrustReader
/// interface. Real ERC-8004 Identity/Reputation registry reads land behind this same
/// interface in a later feature — HandlerWallet never changes.
/// @dev Unregistered addresses default to Tier.FLAGGED (the enum's zero value), matching
/// the documented secure default for an unverified counterparty.
contract TrustReader is Ownable, ITrustReader {
    mapping(address account => Tier tier) private overrides;

    event TierOverrideSet(address indexed account, Tier tier);

    constructor(address owner_) Ownable(owner_) {}

    function setOverride(address account, Tier tier) external onlyOwner {
        overrides[account] = tier;
        emit TierOverrideSet(account, tier);
    }

    function tierOf(address account) external view returns (Tier) {
        return overrides[account];
    }
}
