// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Vm} from "forge-std/Vm.sol";
import {HandlerWallet} from "../src/HandlerWallet.sol";
import {HandlerWalletFactory} from "../src/HandlerWalletFactory.sol";
import {TrustReader} from "../src/TrustReader.sol";
import {Tier} from "../src/interfaces/ITrustReader.sol";
import {IPriceConverter} from "../src/interfaces/IPriceConverter.sol";
import {DeployConfig} from "./DeployConfig.sol";

/// @notice The contracts lane's own integration smoke test (contracts-roadmap.md §3/§4's day-6
/// exit criterion): replays the three renumbered demo beats end-to-end against a real local
/// `HandlerWallet` deployment on an anvil fork of Base mainnet. This is NOT the mainnet demo
/// trigger — that's `apps/api`'s `POST /demo/beat/:n` against the real showcase wallet. This
/// script only ever targets a local anvil fork and never touches the showcase wallet or any
/// production secret.
///
/// Concrete values this script uses (locked here per current-feature.md 9a's step 1, matching
/// the real contracts — not invented numbers dressed up as "real config"; `apps/api`'s
/// `agents.config.ts`/`villain.config.ts` hold only session keys + flat payment wei amounts, no
/// AgentPolicy caps, since real policies are owner-set at hire time — there is no fixed "real"
/// policy shape to mirror):
///   - Target: local anvil fork only (`pnpm dev:chain`), chain id 31337.
///   - `HandlerWalletFactory` at 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 — must match
///     `ts/addresses.ts`'s `31337.factory` entry (the committed `DeployDev.s.sol` output).
///     `TrustReader`/`PriceConverter` are read off the factory's own immutable getters rather
///     than duplicated as separate constants, so they can never drift from what the factory
///     actually uses.
///   - Five fresh, deterministically-labeled actors via `makeAddrAndKey` (no committed private
///     keys, no dependency on any real showcase secret): `demoReplayOwner`, `demoReplayRiley`,
///     `demoReplayVillain`, `demoReplayCounterparty`, `demoReplayFeedbackClient`. Funded from the
///     script's broadcaster, which must itself be a real funded local account (see the run
///     instructions at the bottom of this file) — e.g. anvil's default account #0.
///   - The counterparty is registered fresh, in-script, in the real ERC-8004 Identity +
///     Reputation registries (same `register()`/`giveFeedback()`/`TrustReader.syncAgent()`
///     sequence as `apps/api/scripts/register-agents.ts`, mirrored below) so this script never
///     depends on the real showcase Subcontractor's secret key or on any prior chain state.
///     3 feedback entries at score 90/100 clears `TrustReader.VERIFIED_MIN_SCORE_WAD` (80) and
///     `VERIFIED_MIN_FEEDBACK_COUNT` (3), same thresholds as the real showcase setup.
///   - Riley and the villain are hired onto one fresh `HandlerWallet` (via the factory, created
///     if the deterministic owner doesn't have one on this fork yet) with identical policies:
///     $1,000/day cap, $500/tx cap, $50 cosign threshold, VERIFIED-only counterparties, no
///     swaps/unknown-contract allowance (unneeded — every beat here is a plain ETH transfer to
///     an EOA, which classifies as `CallKind.TRANSFER` regardless of those two flags).
///   - Beat 1 pays the counterparty ~$10 (under the $50 cosign threshold) → `Executed`.
///   - Beat 2 has the villain pay a fresh, never-synced address (`demoReplayVillainTarget`,
///     `FLAGGED` by `TrustReader`'s fail-closed default) ~$1 → blocked via `tryExecute()` →
///     `ExecutionBlocked` with `BlockReason.COUNTERPARTY_BELOW_TIER` (the tier check runs before
///     USD valuation in `HandlerWallet._evaluate()`, so the exact amount doesn't matter here).
///   - Beat 3 pays the counterparty ~$100 (above the $50 cosign threshold, still under the
///     $500/tx and $1,000/day caps) → `tryExecute()` auto-routes to `Proposed`, then the owner
///     calls `approve()` to close the loop.
///   - Beat 1/3 amounts are computed from the fork's real live ETH/USD price
///     (`priceConverter.usdValue(address(0), 1 ether)`) rather than hardcoded wei, so the beats
///     stay correctly ordered relative to the $50 cosign threshold regardless of ETH's price at
///     whatever block the fork is at.
///
/// How to run (against `pnpm dev:chain`'s anvil, which forks Base mainnet — see
/// `context/backend-roadmap.md`'s `docker-compose.yml`):
///
///     forge script script/DemoReplay.s.sol \
///       --rpc-url http://localhost:8545 \
///       --private-key <a funded local account, e.g. anvil's default account #0> \
///       --broadcast
///
/// If DeployDev.s.sol landed the local factory somewhere other than the committed
/// ts/addresses.ts 31337 entry (e.g. a fresh anvil forking a real chain id instead of 31337
/// itself, which shifts the deterministic deploy address), pass DEMO_REPLAY_FACTORY=<address>.
///
/// Expected output: one `Beat N (...): PASS` line per beat, then `DemoReplay: all 3 beats
/// passed`. Any failed assertion reverts the whole run with a clear require() message naming
/// which beat and what was expected.
contract DemoReplay is Script, DeployConfig {
    // Matches ts/addresses.ts's `31337.factory` entry (the committed local DeployDev.s.sol
    // output) — see this file's header for why TrustReader/PriceConverter aren't duplicated
    // here as separate constants. Overridable via DEMO_REPLAY_FACTORY for a fork whose
    // DeployDev.s.sol run landed at a different address (e.g. a non-anvil-default chain id).
    address constant DEFAULT_FACTORY = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;

    uint128 constant DAILY_CAP_USD8 = 1_000 * 1e8;
    uint128 constant PER_TX_CAP_USD8 = 500 * 1e8;
    uint128 constant COSIGN_ABOVE_USD8 = 50 * 1e8;
    uint128 constant BEAT1_TARGET_USD8 = 10 * 1e8;
    uint128 constant BEAT3_TARGET_USD8 = 100 * 1e8;
    uint256 constant VILLAIN_PAYMENT_WEI = 0.001 ether;

    /// @dev 0-100 convention (see TrustReader.sol), comfortably above VERIFIED_MIN_SCORE_WAD.
    int128 constant VERIFIED_FEEDBACK_SCORE = 90;
    bytes32 constant ZERO_BYTES32 = bytes32(0);

    bytes32 constant EXECUTED_TOPIC = keccak256("Executed(address,address,uint128,uint8)");
    bytes32 constant BLOCKED_TOPIC = keccak256("ExecutionBlocked(address,uint8,uint128)");
    bytes32 constant PROPOSED_TOPIC = keccak256("Proposed(bytes32,address,address,uint256,uint128)");
    bytes32 constant APPROVED_TOPIC = keccak256("Approved(bytes32)");

    function run() external {
        HandlerWalletFactory factory = HandlerWalletFactory(vm.envOr("DEMO_REPLAY_FACTORY", DEFAULT_FACTORY));
        TrustReader trustReader = TrustReader(address(factory.trustReader()));
        IPriceConverter priceConverter = factory.priceConverter();

        (address owner, uint256 ownerKey) = makeAddrAndKey("demoReplayOwner");
        (address riley, uint256 rileyKey) = makeAddrAndKey("demoReplayRiley");
        (address villain, uint256 villainKey) = makeAddrAndKey("demoReplayVillain");
        (address counterparty, uint256 counterpartyKey) = makeAddrAndKey("demoReplayCounterparty");
        (address feedbackClient, uint256 feedbackClientKey) = makeAddrAndKey("demoReplayFeedbackClient");
        address villainTarget = makeAddr("demoReplayVillainTarget");

        console.log("Owner:", owner);
        console.log("Riley:", riley);
        console.log("Villain:", villain);
        console.log("Counterparty:", counterparty);
        console.log("Villain target (fresh, unregistered):", villainTarget);

        _fundActors(owner, riley, villain, counterparty, feedbackClient);

        uint256 agentId = _registerVerifiedCounterparty(trustReader, counterpartyKey, feedbackClientKey);
        console.log("Counterparty registered as ERC-8004 agentId:", agentId);
        require(trustReader.tierOf(counterparty) == Tier.VERIFIED, "setup: counterparty did not resolve VERIFIED");
        require(trustReader.tierOf(villainTarget) == Tier.FLAGGED, "setup: villain target unexpectedly not FLAGGED");

        HandlerWallet wallet = _resolveWallet(factory, owner, ownerKey);
        _hireAgents(wallet, riley, villain, ownerKey);

        uint128 ethPriceUsd8 = priceConverter.usdValue(address(0), 1 ether);
        uint256 beat1Wei = (uint256(BEAT1_TARGET_USD8) * 1 ether) / ethPriceUsd8;
        uint256 beat3Wei = (uint256(BEAT3_TARGET_USD8) * 1 ether) / ethPriceUsd8;

        // Fund exactly what beats 1 + 3 will spend, plus a 20% buffer — derived from the same
        // live-price math as the beats themselves, rather than a flat guess that could fall
        // short if ETH's price ever dropped far enough to inflate the wei amounts.
        _fundWallet(wallet, ownerKey, (beat1Wei + beat3Wei) * 12 / 10);

        _runBeat1(wallet, rileyKey, counterparty, beat1Wei);
        _runBeat2(wallet, villainKey, villainTarget);
        _runBeat3(wallet, rileyKey, ownerKey, counterparty, beat3Wei);

        console.log("DemoReplay: all 3 beats passed");
    }

    // ---------------------------------------------------------------------
    // Beats
    // ---------------------------------------------------------------------

    /// @dev Beat 1: Riley pays the Verified counterparty within every cap -> Executed.
    function _runBeat1(HandlerWallet wallet, uint256 rileyKey, address counterparty, uint256 amountWei) internal {
        vm.recordLogs();
        vm.broadcast(rileyKey);
        bool ok = wallet.tryExecute(HandlerWallet.Call({target: counterparty, data: "", value: amountWei}));
        require(ok, "beat 1: expected Executed, tryExecute() returned false");

        (bool found,) = _findLog(vm.getRecordedLogs(), address(wallet), EXECUTED_TOPIC);
        require(found, "beat 1: Executed event not found");
        console.log("Beat 1 (pay Verified counterparty -> Executed): PASS");
    }

    /// @dev Beat 2: the villain pays a fresh, never-synced (FLAGGED) target -> blocked via
    /// tryExecute(), never a revert, with reason COUNTERPARTY_BELOW_TIER.
    function _runBeat2(HandlerWallet wallet, uint256 villainKey, address villainTarget) internal {
        vm.recordLogs();
        vm.broadcast(villainKey);
        bool ok = wallet.tryExecute(HandlerWallet.Call({target: villainTarget, data: "", value: VILLAIN_PAYMENT_WEI}));
        require(!ok, "beat 2: expected ExecutionBlocked, tryExecute() returned true");

        (bool found, Vm.Log memory log) = _findLog(vm.getRecordedLogs(), address(wallet), BLOCKED_TOPIC);
        require(found, "beat 2: ExecutionBlocked event not found");
        (HandlerWallet.BlockReason reason,) = abi.decode(log.data, (HandlerWallet.BlockReason, uint128));
        require(
            reason == HandlerWallet.BlockReason.COUNTERPARTY_BELOW_TIER,
            "beat 2: blocked for the wrong reason (expected COUNTERPARTY_BELOW_TIER)"
        );
        console.log("Beat 2 (villain pays FLAGGED target -> ExecutionBlocked): PASS");
    }

    /// @dev Beat 3: Riley pays the same Verified counterparty above cosignAboveUsd ->
    /// tryExecute() auto-routes to Proposed, then the owner approve()s it -> Executed + resolved.
    function _runBeat3(
        HandlerWallet wallet,
        uint256 rileyKey,
        uint256 ownerKey,
        address counterparty,
        uint256 amountWei
    ) internal {
        vm.recordLogs();
        vm.broadcast(rileyKey);
        bool ok = wallet.tryExecute(HandlerWallet.Call({target: counterparty, data: "", value: amountWei}));
        require(!ok, "beat 3: expected Proposed (not Executed), tryExecute() returned true");

        (bool found, Vm.Log memory log) = _findLog(vm.getRecordedLogs(), address(wallet), PROPOSED_TOPIC);
        require(found, "beat 3: Proposed event not found");
        bytes32 id = log.topics[1];

        vm.recordLogs();
        vm.broadcast(ownerKey);
        wallet.approve(id);

        // getRecordedLogs() drains its buffer on every call, so capture it once and search the
        // same snapshot twice — a second live call here would always see an empty log set.
        Vm.Log[] memory approveLogs = vm.getRecordedLogs();
        (bool approvedFound,) = _findLog(approveLogs, address(wallet), APPROVED_TOPIC);
        require(approvedFound, "beat 3: Approved event not found after approve()");
        (bool executedFound,) = _findLog(approveLogs, address(wallet), EXECUTED_TOPIC);
        require(executedFound, "beat 3: Executed event not found after approve()");

        (,,,,, bool resolved,) = wallet.pendingApprovals(id);
        require(resolved, "beat 3: pending approval did not resolve");
        console.log("Beat 3 (pay above cosign threshold -> Proposed -> approve()): PASS");
    }

    function _findLog(Vm.Log[] memory logs, address emitter, bytes32 topic0)
        internal
        pure
        returns (bool found, Vm.Log memory log)
    {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == emitter && logs[i].topics.length > 0 && logs[i].topics[0] == topic0) {
                return (true, logs[i]);
            }
        }
    }

    function _fundActors(address owner, address riley, address villain, address counterparty, address feedbackClient)
        internal
    {
        vm.startBroadcast();
        payable(owner).transfer(2 ether);
        payable(riley).transfer(1 ether);
        payable(villain).transfer(1 ether);
        payable(counterparty).transfer(1 ether);
        payable(feedbackClient).transfer(1 ether);
        vm.stopBroadcast();
    }

    /// @dev Mirrors apps/api/scripts/register-agents.ts's write sequence against the real
    /// ERC-8004 registries: register() -> 3x giveFeedback(90) -> TrustReader.syncAgent(). Those
    /// two write functions aren't in ITrustReader/IIdentityRegistry/IReputationRegistry (our
    /// contracts only ever read them), so they're declared locally here, same as the TS script
    /// does with a script-local ABI slice.
    function _registerVerifiedCounterparty(TrustReader trustReader, uint256 counterpartyKey, uint256 feedbackClientKey)
        internal
        returns (uint256 agentId)
    {
        vm.broadcast(counterpartyKey);
        agentId = IIdentityRegistryWrite(IDENTITY_REGISTRY).register("");

        for (uint256 i = 0; i < 3; i++) {
            vm.broadcast(feedbackClientKey);
            IReputationRegistryWrite(REPUTATION_REGISTRY)
                .giveFeedback(agentId, VERIFIED_FEEDBACK_SCORE, 0, "", "", "", "", ZERO_BYTES32);
        }

        vm.broadcast(counterpartyKey);
        trustReader.syncAgent(agentId);
    }

    function _resolveWallet(HandlerWalletFactory factory, address owner, uint256 ownerKey)
        internal
        returns (HandlerWallet wallet)
    {
        address walletAddr = factory.walletOf(owner);
        if (walletAddr == address(0)) {
            vm.broadcast(ownerKey);
            walletAddr = factory.createWallet(owner);
            console.log("Created fresh HandlerWallet:", walletAddr);
        } else {
            console.log("Reusing existing HandlerWallet:", walletAddr);
        }
        wallet = HandlerWallet(payable(walletAddr));
    }

    function _fundWallet(HandlerWallet wallet, uint256 ownerKey, uint256 amountWei) internal {
        vm.broadcast(ownerKey);
        (bool ok,) = payable(address(wallet)).call{value: amountWei}("");
        require(ok, "setup: failed to fund HandlerWallet");
    }

    function _hireAgents(HandlerWallet wallet, address riley, address villain, uint256 ownerKey) internal {
        HandlerWallet.AgentPolicy memory policy = HandlerWallet.AgentPolicy({
            dailyCapUsd: DAILY_CAP_USD8,
            perTxCapUsd: PER_TX_CAP_USD8,
            cosignAboveUsd: COSIGN_ABOVE_USD8,
            epochStart: 0,
            spentThisEpoch: 0,
            minCounterpartyTier: Tier.VERIFIED,
            allowSwaps: false,
            allowUnknownContracts: false,
            frozen: false
        });

        vm.startBroadcast(ownerKey);
        wallet.hireAgent(riley, policy);
        wallet.hireAgent(villain, policy);
        vm.stopBroadcast();
    }
}

/// @dev Script-local slice of the real ERC-8004 Identity Registry's *write* surface — verified
/// against the same deployed IdentityRegistryUpgradeable source apps/api's register-agents.ts
/// checks against. Kept local rather than added to src/interfaces/erc8004/ since HandlerWallet
/// itself only ever needs the read slice already there.
interface IIdentityRegistryWrite {
    function register(string calldata agentURI) external returns (uint256 agentId);
}

/// @dev Script-local slice of the real ERC-8004 Reputation Registry's *write* surface, same
/// rationale as IIdentityRegistryWrite above.
interface IReputationRegistryWrite {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}
