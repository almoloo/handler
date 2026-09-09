// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {HandlerWalletFactory} from "../src/HandlerWalletFactory.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {IIdentityRegistry} from "../src/interfaces/erc8004/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/erc8004/IReputationRegistry.sol";
import {AggregatorV3Interface} from "../src/interfaces/chainlink/AggregatorV3Interface.sol";
import {DeployConfig} from "./DeployConfig.sol";

/// @notice The real public deployment: PriceConverter -> TrustReader -> HandlerWallet -> Factory,
/// all owned by the broadcasting account, on Base mainnet (chain id 8453) — see
/// context/current-feature.md's "Move the public deployment to Base mainnet" fix for why: the
/// ERC-8004 registries and the Chainlink feeds this deployment depends on only have code on
/// Base mainnet, not on any testnet. Shares its registry/feed constants with DeployDev.s.sol
/// via DeployConfig — this really is Base mainnet, not a fork of it, so the same addresses
/// apply for real rather than via anvil's fork.
///
/// Also deploys a deployer-owned HandlerWallet directly (mirroring DeployDev.s.sol's dev
/// wallet), even though the public hire flow only ever creates wallets through the factory:
/// chain.config.ts's resolveHandlerWalletAddress() throws (not null) when unset, and
/// trust.service.ts/indexer.service.ts read it unconditionally at boot — so the api container
/// would crash on start against 8453 without an addresses.ts handlerWallet entry. Retiring
/// that dependency in favor of a fully factory-only flow is the separate follow-up fix noted in
/// context/current-feature.md's "Deliberately not in this fix".
contract DeployBase is Script, DeployConfig {
    function run() external {
        vm.startBroadcast();
        address deployer = msg.sender;

        PriceConverter priceConverter = new PriceConverter(deployer);
        priceConverter.setFeed(address(0), AggregatorV3Interface(ETH_USD_FEED), 18, ETH_MAX_STALENESS);
        priceConverter.setFeed(USDC, AggregatorV3Interface(USDC_USD_FEED), 6, USDC_MAX_STALENESS);

        TrustReader trustReader =
            new TrustReader(IIdentityRegistry(IDENTITY_REGISTRY), IReputationRegistry(REPUTATION_REGISTRY));
        HandlerWallet wallet = new HandlerWallet(deployer, trustReader, priceConverter);
        HandlerWalletFactory factory = new HandlerWalletFactory(trustReader, priceConverter);

        vm.stopBroadcast();

        console.log("Deployer:", deployer);
        console.log("PriceConverter:", address(priceConverter));
        console.log("TrustReader:", address(trustReader));
        console.log("HandlerWallet:", address(wallet));
        console.log("HandlerWalletFactory:", address(factory));
    }
}
