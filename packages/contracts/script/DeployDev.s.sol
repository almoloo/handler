// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {IIdentityRegistry} from "../src/interfaces/erc8004/IIdentityRegistry.sol";
import {IReputationRegistry} from "../src/interfaces/erc8004/IReputationRegistry.sol";

/// @notice Local-dev deployment: PriceConverter -> TrustReader -> HandlerWallet, all owned by
/// the broadcasting account. Run against anvil (see pnpm dev:chain); the resulting addresses
/// are deterministic across every fresh anvil boot, so they get committed into
/// packages/contracts/ts/addresses.ts rather than regenerated per run.
contract DeployDev is Script {
    /// @dev Real ERC-8004 registries, same address on every chain they're deployed to
    /// (incl. Base mainnet) — see packages/contracts/src/interfaces/erc8004/*.sol. Anvil
    /// forks Base mainnet (BASE_RPC_URL, see pnpm dev:chain), so these are live at the
    /// fork block, not stubs.
    address constant IDENTITY_REGISTRY = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;
    address constant REPUTATION_REGISTRY = 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63;

    function run() external {
        vm.startBroadcast();
        address deployer = msg.sender;

        PriceConverter priceConverter = new PriceConverter(deployer);
        TrustReader trustReader =
            new TrustReader(IIdentityRegistry(IDENTITY_REGISTRY), IReputationRegistry(REPUTATION_REGISTRY));
        HandlerWallet wallet = new HandlerWallet(deployer, trustReader, priceConverter);

        vm.stopBroadcast();

        console.log("Deployer:", deployer);
        console.log("PriceConverter:", address(priceConverter));
        console.log("TrustReader:", address(trustReader));
        console.log("HandlerWallet:", address(wallet));
    }
}
