// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {HandlerWalletFactory} from "../src/HandlerWalletFactory.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {MockTrustReader} from "./mocks/MockTrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

contract HandlerWalletFactoryTest is Test {
    HandlerWalletFactory factory;
    MockTrustReader trustReader;
    PriceConverter priceConverter;

    address deployer = makeAddr("deployer");
    address ownerA = makeAddr("ownerA");
    address ownerB = makeAddr("ownerB");
    address sessionKey = makeAddr("sessionKey");
    address recipient = makeAddr("recipient");

    uint128 constant ETH_USD8 = 2_000_00000000;

    function setUp() public {
        vm.startPrank(deployer);
        trustReader = new MockTrustReader();
        priceConverter = new PriceConverter(deployer);
        priceConverter.setFeed(address(0), new MockV3Aggregator(8, int256(uint256(ETH_USD8))), 18, type(uint256).max);
        factory = new HandlerWalletFactory(trustReader, priceConverter);
        vm.stopPrank();
    }

    function test_ComputeWalletAddress_MatchesActualDeployAddress() public {
        address predicted = factory.computeWalletAddress(ownerA);

        vm.prank(ownerA);
        address deployed = factory.createWallet(ownerA);

        assertEq(deployed, predicted);
    }

    function test_CreateWallet_EmitsWalletCreatedAndRecordsWalletOf() public {
        address predicted = factory.computeWalletAddress(ownerA);

        vm.expectEmit(true, true, false, false, address(factory));
        emit HandlerWalletFactory.WalletCreated(ownerA, predicted);

        vm.prank(ownerA);
        address deployed = factory.createWallet(ownerA);

        assertEq(factory.walletOf(ownerA), deployed);
    }

    function test_CreateWallet_DeployedWalletIsOwnedByOwnerAndFunctional() public {
        vm.prank(ownerA);
        address walletAddr = factory.createWallet(ownerA);
        HandlerWallet wallet = HandlerWallet(payable(walletAddr));

        assertEq(wallet.owner(), ownerA);
        assertEq(address(wallet.trustReader()), address(trustReader));
        assertEq(address(wallet.priceConverter()), address(priceConverter));

        vm.prank(ownerA);
        trustReader.setTier(recipient, Tier.NEW);

        vm.prank(ownerA);
        wallet.hireAgent(
            sessionKey,
            HandlerWallet.AgentPolicy({
                dailyCapUsd: 1_000_00000000,
                perTxCapUsd: 1_000_00000000,
                cosignAboveUsd: 1_000_00000000,
                epochStart: 0,
                spentThisEpoch: 0,
                minCounterpartyTier: Tier.NEW,
                allowSwaps: true,
                allowUnknownContracts: false,
                frozen: false
            })
        );

        vm.deal(walletAddr, 1 ether);
        vm.prank(sessionKey);
        wallet.execute(HandlerWallet.Call({target: recipient, data: "", value: 0.01 ether}));

        assertEq(recipient.balance, 0.01 ether);
    }

    function test_CreateWallet_RevertsIfOwnerAlreadyHasAWallet() public {
        vm.prank(ownerA);
        address first = factory.createWallet(ownerA);

        vm.expectRevert(abi.encodeWithSelector(HandlerWalletFactory.WalletAlreadyExists.selector, ownerA, first));
        vm.prank(ownerA);
        factory.createWallet(ownerA);
    }

    function test_CreateWallet_IsPermissionless_AnyCallerCanDeployForAnyOwner() public {
        vm.prank(makeAddr("randomCaller"));
        address deployed = factory.createWallet(ownerA);

        assertEq(HandlerWallet(payable(deployed)).owner(), ownerA);
    }

    function test_ComputeWalletAddress_DiffersPerOwner() public view {
        address predictedA = factory.computeWalletAddress(ownerA);
        address predictedB = factory.computeWalletAddress(ownerB);

        assertTrue(predictedA != predictedB);
    }
}
