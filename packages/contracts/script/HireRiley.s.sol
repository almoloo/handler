// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {PriceConverter} from "../src/PriceConverter.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";

/// @notice Local-dev setup for Riley (the rebalancer catalog agent, backend-roadmap day 3):
/// hires Riley's session key on the dev HandlerWallet with a swap-enabled policy, registers
/// the 1inch Aggregation Router as a known router, and sets the ETH/USD rate PriceConverter's
/// stub needs to value the swap. Run by the wallet owner (the same broadcaster as
/// DeployDev.s.sol) against the local anvil fork; the wallet address matches the deterministic
/// dev deployment committed in packages/contracts/ts/addresses.ts.
contract HireRiley is Script {
    address constant DEV_HANDLER_WALLET = 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0;

    /// 1inch Aggregation Router V6 — same address across every chain it's deployed on,
    /// including the Base mainnet this repo's anvil fork targets.
    address constant ONE_INCH_ROUTER = 0x111111125421cA6dc452d289314280a0f8842A65;

    /// Stub ETH/USD rate for local dev only (PriceConverter.setRate is the documented
    /// transitional stub until real Chainlink reads land) — roughly $3,000/ETH in USD-8.
    uint128 constant DEV_ETH_USD_RATE = 3_000_00000000;

    /// Generous enough for the fixed dev swap amount, and comfortably above it so a run
    /// never needs the cosign queue.
    uint128 constant DEV_CAP_USD = 500_00000000;

    function run() external {
        uint256 rileyKey = vm.envUint("RILEY_SESSION_KEY");
        address riley = vm.addr(rileyKey);

        HandlerWallet wallet = HandlerWallet(payable(DEV_HANDLER_WALLET));

        vm.startBroadcast();

        wallet.hireAgent(
            riley,
            HandlerWallet.AgentPolicy({
                dailyCapUsd: DEV_CAP_USD,
                perTxCapUsd: DEV_CAP_USD,
                cosignAboveUsd: DEV_CAP_USD,
                epochStart: 0,
                spentThisEpoch: 0,
                // No reputation-scored counterparty here — Riley calls a known infra router,
                // not another agent, so the tier gate stays open rather than faking an
                // override on the router's address.
                minCounterpartyTier: Tier.FLAGGED,
                allowSwaps: true,
                allowUnknownContracts: false,
                frozen: false
            })
        );

        wallet.setKnownRouter(ONE_INCH_ROUTER, true);
        PriceConverter(address(wallet.priceConverter())).setRate(address(0), DEV_ETH_USD_RATE, 18);

        vm.stopBroadcast();

        console.log("Riley session key:", riley);
        console.log("HandlerWallet:", address(wallet));
        console.log("1inch router registered:", ONE_INCH_ROUTER);
    }
}
