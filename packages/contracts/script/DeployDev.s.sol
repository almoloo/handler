// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";

/// @notice Local-dev deployment: PriceConverter -> TrustReader -> HandlerWallet, all owned by
/// the broadcasting account. Run against anvil (see pnpm dev:chain); the resulting addresses
/// are deterministic across every fresh anvil boot, so they get committed into
/// packages/contracts/ts/addresses.ts rather than regenerated per run.
contract DeployDev is Script {
    function run() external {
        vm.startBroadcast();
        address deployer = msg.sender;

        PriceConverter priceConverter = new PriceConverter(deployer);
        TrustReader trustReader = new TrustReader(deployer);
        HandlerWallet wallet = new HandlerWallet(deployer, trustReader, priceConverter);

        vm.stopBroadcast();

        console.log("Deployer:", deployer);
        console.log("PriceConverter:", address(priceConverter));
        console.log("TrustReader:", address(trustReader));
        console.log("HandlerWallet:", address(wallet));
    }
}
