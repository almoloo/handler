// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AggregatorV3Interface} from "../../src/interfaces/chainlink/AggregatorV3Interface.sol";

/// @notice Test-only AggregatorV3Interface double: a directly settable answer/updatedAt, so
/// PriceConverter's and HandlerWallet's tests can exercise real-feed-reading logic (staleness,
/// decimals normalization) without depending on a live Chainlink deployment. Never used
/// outside test/ — see coding-standards.md's no-mock-data-in-runtime-code rule.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 private immutable _decimals;
    int256 private _answer;
    uint256 private _updatedAt;

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals = decimals_;
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
    }

    function setAnswer(int256 answer) external {
        _answer = answer;
        _updatedAt = block.timestamp;
    }

    /// @dev Test-only escape hatch to simulate a malformed feed reporting a future
    /// updatedAt — PriceConverter must reject this cleanly rather than underflow.
    function setUpdatedAt(uint256 updatedAt) external {
        _updatedAt = updatedAt;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function description() external pure returns (string memory) {
        return "MockV3Aggregator";
    }

    function version() external pure returns (uint256) {
        return 4;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }
}
