// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceConverter} from "./interfaces/IPriceConverter.sol";
import {AggregatorV3Interface} from "./interfaces/chainlink/AggregatorV3Interface.sol";

/// @notice Real Chainlink AggregatorV3 price source behind the IPriceConverter interface.
/// The owner configures *which feed* backs a token and how stale a round may be
/// (`setFeed`) — never a price. `usdValue` always reads the feed live.
contract PriceConverter is Ownable, IPriceConverter {
    struct Feed {
        AggregatorV3Interface feed;
        uint8 tokenDecimals; // token's native decimals (18 for native ETH, address(0))
        uint256 maxStaleness; // seconds a round may be old before usdValue reverts
        bool isSet;
    }

    uint8 private constant USD_DECIMALS = 8;

    mapping(address token => Feed config) private feeds;

    error FeedNotSet(address token);
    error StalePrice(address token, uint256 updatedAt);
    error InvalidPrice(address token, int256 answer);
    error InvalidRoundTimestamp(address token, uint256 updatedAt);
    error UsdValueOverflow(uint256 usd8);

    event FeedSet(address indexed token, AggregatorV3Interface indexed feed, uint8 tokenDecimals, uint256 maxStaleness);

    constructor(address owner_) Ownable(owner_) {}

    function setFeed(address token, AggregatorV3Interface feed, uint8 tokenDecimals, uint256 maxStaleness)
        external
        onlyOwner
    {
        feeds[token] = Feed({feed: feed, tokenDecimals: tokenDecimals, maxStaleness: maxStaleness, isSet: true});
        emit FeedSet(token, feed, tokenDecimals, maxStaleness);
    }

    function usdValue(address token, uint256 amount) external view returns (uint128 usd8) {
        Feed memory f = feeds[token];
        if (!f.isSet) revert FeedNotSet(token);

        (, int256 answer,, uint256 updatedAt,) = f.feed.latestRoundData();
        if (answer <= 0) revert InvalidPrice(token, answer);
        // Guard the subtraction below: a malformed/misbehaving feed reporting updatedAt in
        // the future would otherwise underflow into a generic panic instead of a named error.
        if (updatedAt > block.timestamp) revert InvalidRoundTimestamp(token, updatedAt);
        if (block.timestamp - updatedAt > f.maxStaleness) revert StalePrice(token, updatedAt);

        uint256 price8 = _normalizeToUsd8(uint256(answer), f.feed.decimals());
        uint256 value = (amount * price8) / (10 ** f.tokenDecimals);
        if (value > type(uint128).max) revert UsdValueOverflow(value);
        return uint128(value);
    }

    function _normalizeToUsd8(uint256 price, uint8 feedDecimals) private pure returns (uint256) {
        if (feedDecimals == USD_DECIMALS) return price;
        if (feedDecimals > USD_DECIMALS) return price / (10 ** (feedDecimals - USD_DECIMALS));
        return price * (10 ** (USD_DECIMALS - feedDecimals));
    }
}
