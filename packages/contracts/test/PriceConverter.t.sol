// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PriceConverter} from "../src/PriceConverter.sol";

contract PriceConverterTest is Test {
    PriceConverter priceConverter;

    address owner = makeAddr("owner");
    address usdc = makeAddr("usdc");

    function setUp() public {
        vm.prank(owner);
        priceConverter = new PriceConverter(owner);
    }

    function test_UsdValue_RevertsIfRateNotSet() public {
        vm.expectRevert(abi.encodeWithSelector(PriceConverter.RateNotSet.selector, usdc));
        priceConverter.usdValue(usdc, 1e6);
    }

    function test_SetRate_ThenUsdValue_NativeEth() public {
        vm.prank(owner);
        // 1 ETH = $2,000.00 (USD-8), 18 decimals
        priceConverter.setRate(address(0), 2_000_00000000, 18);

        uint128 usd8 = priceConverter.usdValue(address(0), 0.5 ether);
        assertEq(usd8, 1_000_00000000);
    }

    function test_SetRate_ThenUsdValue_Erc20SixDecimals() public {
        vm.prank(owner);
        // USDC ~= $1.00 (USD-8), 6 decimals
        priceConverter.setRate(usdc, 1_00000000, 6);

        uint128 usd8 = priceConverter.usdValue(usdc, 25_000_000); // 25 USDC
        assertEq(usd8, 25_00000000);
    }

    function test_SetRate_RevertsForNonOwner() public {
        vm.expectRevert();
        priceConverter.setRate(usdc, 1_00000000, 6);
    }

    function test_UsdValue_RevertsOnUint128Overflow() public {
        vm.prank(owner);
        // 0 decimals means usd8PerWholeUnit applies per unit of `amount` directly, so a large
        // enough amount pushes the result past type(uint128).max.
        priceConverter.setRate(usdc, type(uint128).max, 0);

        vm.expectRevert(
            abi.encodeWithSelector(PriceConverter.UsdValueOverflow.selector, uint256(type(uint128).max) * 2)
        );
        priceConverter.usdValue(usdc, 2);
    }
}
