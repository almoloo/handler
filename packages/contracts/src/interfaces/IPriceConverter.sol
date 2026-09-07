// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPriceConverter {
    /// @notice USD value of `amount` of `token` (address(0) = native ETH), 8-decimal fixed point.
    function usdValue(address token, uint256 amount) external view returns (uint128 usd8);
}
