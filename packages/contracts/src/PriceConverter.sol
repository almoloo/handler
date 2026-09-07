// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceConverter} from "./interfaces/IPriceConverter.sol";

/// @notice Stub price source: an owner-settable fixed rate per token behind the
/// IPriceConverter interface. Real Chainlink AggregatorV3 reads (with staleness checks)
/// land behind this same interface in a later feature — HandlerWallet never changes.
contract PriceConverter is Ownable, IPriceConverter {
    struct Rate {
        uint128 usd8PerWholeUnit; // USD value (8-decimal) of one whole token unit
        uint8 decimals; // token's native decimals (18 for native ETH, address(0))
        bool isSet;
    }

    mapping(address token => Rate rate) private rates;

    error RateNotSet(address token);
    error UsdValueOverflow(uint256 usd8);

    event RateSet(address indexed token, uint128 usd8PerWholeUnit, uint8 decimals);

    constructor(address owner_) Ownable(owner_) {}

    function setRate(address token, uint128 usd8PerWholeUnit, uint8 decimals) external onlyOwner {
        rates[token] = Rate({usd8PerWholeUnit: usd8PerWholeUnit, decimals: decimals, isSet: true});
        emit RateSet(token, usd8PerWholeUnit, decimals);
    }

    function usdValue(address token, uint256 amount) external view returns (uint128 usd8) {
        Rate memory r = rates[token];
        if (!r.isSet) revert RateNotSet(token);
        uint256 value = (amount * r.usd8PerWholeUnit) / (10 ** r.decimals);
        if (value > type(uint128).max) revert UsdValueOverflow(value);
        return uint128(value);
    }
}
