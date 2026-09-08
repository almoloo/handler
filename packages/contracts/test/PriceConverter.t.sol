// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {AggregatorV3Interface} from "../src/interfaces/chainlink/AggregatorV3Interface.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";

contract PriceConverterTest is Test {
    PriceConverter priceConverter;
    MockV3Aggregator ethFeed;
    MockV3Aggregator usdcFeed;

    address owner = makeAddr("owner");
    address usdc = makeAddr("usdc");

    uint256 constant ONE_HOUR = 1 hours;

    function setUp() public {
        vm.startPrank(owner);
        priceConverter = new PriceConverter(owner);
        ethFeed = new MockV3Aggregator(8, 2_000_00000000); // $2,000.00, 8-dec feed
        usdcFeed = new MockV3Aggregator(8, 1_00000000); // $1.00, 8-dec feed
        vm.stopPrank();
    }

    function test_UsdValue_RevertsIfFeedNotSet() public {
        vm.expectRevert(abi.encodeWithSelector(PriceConverter.FeedNotSet.selector, usdc));
        priceConverter.usdValue(usdc, 1e6);
    }

    function test_SetFeed_ThenUsdValue_NativeEth() public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);

        uint128 usd8 = priceConverter.usdValue(address(0), 0.5 ether);
        assertEq(usd8, 1_000_00000000);
    }

    function test_SetFeed_ThenUsdValue_Erc20SixDecimals() public {
        vm.prank(owner);
        priceConverter.setFeed(usdc, usdcFeed, 6, ONE_HOUR);

        uint128 usd8 = priceConverter.usdValue(usdc, 25_000_000); // 25 USDC
        assertEq(usd8, 25_00000000);
    }

    function test_UsdValue_NormalizesFeedDecimalsAbove8() public {
        MockV3Aggregator feed18 = new MockV3Aggregator(18, 2_000 * 1e18); // 18-dec feed
        vm.prank(owner);
        priceConverter.setFeed(address(0), feed18, 18, ONE_HOUR);

        uint128 usd8 = priceConverter.usdValue(address(0), 1 ether);
        assertEq(usd8, 2_000_00000000);
    }

    function test_UsdValue_NormalizesFeedDecimalsBelow8() public {
        MockV3Aggregator feed2 = new MockV3Aggregator(2, 2_000_00); // 2-dec feed
        vm.prank(owner);
        priceConverter.setFeed(address(0), feed2, 18, ONE_HOUR);

        uint128 usd8 = priceConverter.usdValue(address(0), 1 ether);
        assertEq(usd8, 2_000_00000000);
    }

    function test_UsdValue_RevertsOnStalePrice() public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);

        uint256 updatedAt = block.timestamp;
        vm.warp(block.timestamp + ONE_HOUR + 1);

        vm.expectRevert(abi.encodeWithSelector(PriceConverter.StalePrice.selector, address(0), updatedAt));
        priceConverter.usdValue(address(0), 1 ether);
    }

    function test_UsdValue_DoesNotRevertExactlyAtStalenessWindow() public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);

        vm.warp(block.timestamp + ONE_HOUR);
        priceConverter.usdValue(address(0), 1 ether);
    }

    function test_UsdValue_RevertsOnNonPositiveAnswer() public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);
        ethFeed.setAnswer(0);

        vm.expectRevert(abi.encodeWithSelector(PriceConverter.InvalidPrice.selector, address(0), int256(0)));
        priceConverter.usdValue(address(0), 1 ether);
    }

    function test_UsdValue_RevertsOnNegativeAnswer() public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);
        ethFeed.setAnswer(-1);

        vm.expectRevert(abi.encodeWithSelector(PriceConverter.InvalidPrice.selector, address(0), int256(-1)));
        priceConverter.usdValue(address(0), 1 ether);
    }

    function test_UsdValue_RevertsOnFutureUpdatedAt() public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);
        ethFeed.setUpdatedAt(block.timestamp + 1 days);

        vm.expectRevert(
            abi.encodeWithSelector(PriceConverter.InvalidRoundTimestamp.selector, address(0), block.timestamp + 1 days)
        );
        priceConverter.usdValue(address(0), 1 ether);
    }

    function test_SetFeed_RevertsForNonOwner() public {
        vm.expectRevert();
        priceConverter.setFeed(usdc, usdcFeed, 6, ONE_HOUR);
    }

    function test_UsdValue_RevertsOnUint128Overflow() public {
        MockV3Aggregator hugeFeed = new MockV3Aggregator(8, int256(uint256(type(uint128).max)));
        vm.prank(owner);
        // 0 decimals means the feed price applies per unit of `amount` directly, so a large
        // enough amount pushes the result past type(uint128).max.
        priceConverter.setFeed(usdc, hugeFeed, 0, ONE_HOUR);

        vm.expectRevert(
            abi.encodeWithSelector(PriceConverter.UsdValueOverflow.selector, uint256(type(uint128).max) * 2)
        );
        priceConverter.usdValue(usdc, 2);
    }

    /// Fuzz per coding-standards.md: usdValue is user-amount-driven arithmetic and must scale
    /// linearly with `amount` for any amount that stays within the uint128 range.
    function testFuzz_UsdValue_ScalesLinearlyWithAmount(uint96 amount) public {
        vm.prank(owner);
        priceConverter.setFeed(address(0), ethFeed, 18, ONE_HOUR);

        uint128 usd8 = priceConverter.usdValue(address(0), amount);
        assertEq(uint256(usd8), (uint256(amount) * 2_000_00000000) / 1e18);
    }
}
