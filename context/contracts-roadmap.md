# Handler — Contracts Roadmap (Solidity Lane, End-to-End)

**Owner:** teammate (Solidity) · **Consumers:** backend indexer + agent runtime, frontend approval sheet, the demo video.
**Prime directive:** every revert must tell a story. The villain beat *is* a revert — reasons are product copy, not debug strings.

---

## 1. Recommended Stack

| Piece | Choice | Why |
|---|---|---|
| Toolchain | **Foundry** (forge/anvil/cast) | Fast tests, fuzzing, cheatcodes, mainnet forking |
| Solidity | 0.8.26+ | Custom errors, transient-storage-ready |
| Libraries | OpenZeppelin (Ownable2Step, ReentrancyGuard, SafeERC20, EnumerableSet) | Don't hand-roll audited things |
| Feeds | Chainlink AggregatorV3 (ETH/USD, USDC/USD) | USD-denominated caps — partner track |
| Trust | ERC-8004 Identity + Reputation registry reads | The differentiator |
| Typegen | forge build artifacts → wagmi/viem codegen in `packages/contracts` | One ABI source for web + api |

**Chain: Base Sepolia** — Chainlink feeds live, ERC-8004 canonically deployed on Base, cheap and fast for retakes.
⚠️ **1inch caveat (resolve day 1):** 1inch aggregation may not serve Base Sepolia. Plan A: run the **entire demo stack** (contracts, backend indexer/agents, frontend RPC) against a **persistent anvil fork of Base mainnet** — real 1inch routing, real Chainlink feeds, real ERC-8004 registries, deterministic takes, and near-instant demo resets via `evm_snapshot`/`evm_revert`; Base Sepolia then serves only as the public "try it live" deployment. Plan B: keep everything on Base Sepolia and route swaps through a mock router labeled honestly, submitting 1inch integration via the fork demo. Decide before writing swap code; the wallet's `execute()` doesn't change either way.

---

## 2. Architecture (3 contracts + 1 reader)

```
HandlerWalletFactory ──deploys──▶ HandlerWallet (one per user, holds funds)
                                     │ consults
                                     ▼
                                 TrustReader (ERC-8004 → tier, + demo override)
                                     ▲
PriceConverter (lib) ── Chainlink ───┘ (USD math used inside HandlerWallet)
```

No ERC-4337, no proxies/upgradeability (out of scope — a hackathon wallet that can't be upgraded is a feature in the README, not a bug).

### 2.1 HandlerWallet — the product
State per hired agent (keyed by session key address):

```solidity
struct AgentPolicy {
    uint128 dailyCapUsd;      // 8-decimals USD
    uint128 perTxCapUsd;
    uint128 cosignAboveUsd;
    uint64  epochStart;       // rolling 24h window anchor
    uint128 spentThisEpoch;   // USD
    Tier    minCounterpartyTier;  // VERIFIED=2 | NEW=1 | FLAGGED=0
    bool    allowSwaps;
    bool    allowUnknownContracts;
    bool    frozen;
}
```

Core surface:

```solidity
function hireAgent(address sessionKey, AgentPolicy calldata p) external onlyOwner;
function updatePolicy(address sessionKey, AgentPolicy calldata p) external onlyOwner;
function freezeAgent(address sessionKey) external onlyOwner;   // + unfreeze
function execute(Call calldata call) external onlySession;     // the gate
function propose(Call calldata call) external onlySession returns (bytes32 id); // over cosign cap
function approve(bytes32 id) external onlyOwner;               // Ledger-signed
function deny(bytes32 id) external onlyOwner;
```

`execute()` check order (each failure = its own custom error):
1. `AgentFrozen()`
2. Target classification: swap router? transfer? unknown contract? → `UnknownContractBlocked()` if `!allowUnknownContracts`, `SwapsNotAllowed()` if applicable
3. Counterparty resolution (payment recipient / router beneficiary) → `TrustReader.tierOf(addr)` → `CounterpartyBelowTier(addr, tier, required)` ← **the villain revert**
4. USD valuation via PriceConverter → `ExceedsPerTxCap(usd, cap)`
5. Epoch roll (lazy: if `now > epochStart + 24h`, reset) → `ExceedsDailyAllowance(usd, remaining)`
6. If `usd > cosignAboveUsd` → revert `RequiresCosign(id)` — session must call `propose()` instead
7. Effects (spentThisEpoch += usd) → interaction (nonReentrant)

Events (frozen with backend by **end of day 2**):
`AgentHired, PolicyUpdated, AgentFrozen, Executed(sessionKey, target, usdValue, kind), ExecutionBlocked(sessionKey, reason enum, usdValue), Proposed(id, …), Approved(id), Denied(id)`
Note: `ExecutionBlocked` is *emitted from a try/catch wrapper?* — No: reverts don't emit. The backend indexer derives BLOCKED rows from failed tx traces **or** the wallet exposes `tryExecute()` that catches internal checks and emits `ExecutionBlocked` without reverting the outer tx. **Recommendation: implement `execute()` (hard revert, pure) + `tryExecute()` (returns bool + emits ExecutionBlocked) and have agents call `tryExecute()`** — blocked attempts then live on-chain as successful txs with a blocked event: indexable, provable in the video's block explorer shot, and no trace-parsing needed. This is the single most demo-critical contract decision.

### 2.2 TrustReader
- `tierOf(address) → Tier`: resolves address → ERC-8004 agentId (Identity Registry) → reputation summary (Reputation Registry) → tier mapping (thresholds constant).
- `setOverride(address, Tier)` `onlyOwner` — the seeded-fixture escape hatch for demo determinism; README discloses it plainly.
- Unregistered address → `FLAGGED` by default (secure default doubles as the villain setup: the villain simply never registers).

### 2.3 PriceConverter (internal lib)
- Chainlink round read with staleness check (`updatedAt` window, revert `StalePrice()`), decimals normalization, ETH + configured ERC20s → USD-8.

### 2.4 HandlerWalletFactory
- `createWallet(owner)` + deterministic address (CREATE2) so the frontend can precompute; emits `WalletCreated`.

---

## 3. Testing Plan (Foundry)

- **Unit:** every custom error has a test that triggers it; epoch-roll math at boundaries (23:59:59 vs 24:00:01); price decimals for ETH + USDC paths.
- **Fuzz:** random amounts/sequences vs caps — invariant: `spentThisEpoch ≤ dailyCapUsd` always.
- **Invariant test:** wallet balance can only decrease via `Executed` or `Approved` paths.
- **Fork test (if Plan A):** real 1inch calldata through `execute()` on the Base fork.
- **The demo test:** one Foundry script that replays beats 1–4 exactly — this is the contract lane's smoke test and doubles as the backend's integration fixture.
- Skip: formal verification, gas golf, slither beyond a single default run on day 7.

---

## 4. Day-by-Day (Solidity lane)

| Day | Goal | Exit criterion |
|---|---|---|
| 1 | Repo/Foundry setup in monorepo, chain decision (1inch Plan A/B spike), interfaces drafted | `packages/contracts` builds; plan chosen |
| 2 | HandlerWallet core: policies, caps, epoch, tryExecute/execute, **events + errors frozen**; **first dev deployment** (chosen chain/anvil) with a pre-created dev wallet, address in shared config, redeployed daily as WIP evolves | Backend indexer unblocked against live logs |
| 3 | TrustReader (8004 reads + override) wired into checks; **session interface frozen** | Riley (backend) unblocked; villain block (`ExecutionBlocked` via `tryExecute`) green in tests |
| 4 | PriceConverter + Chainlink staleness; propose/approve/deny queue | Co-sign loop green in tests |
| 5 | Factory + CREATE2; deploy scripts; formal testnet/fork deployment (frontend switches hire flow from the dev wallet's direct `hireAgent` to the factory) | Frontend hire flow has a real target |
| 6 | Fuzz + invariant suite; fix findings; demo-replay script | Beats 1–4 green from forge script |
| 7 | Freeze. Slither pass, README security notes, final deploy, verify on explorer | Verified contracts, addresses committed to shared config |
| 8–9 | On call for backend/video; no changes except red-alert fixes | — |

---

## 5. Security Notes for the README (judges read these)

Honest scope statement: single-owner wallet, no upgradeability, demo override in TrustReader disclosed, price staleness bounded, reentrancy guarded, session keys can *never* change policy or withdraw to themselves (explicit check: target ≠ sessionKey, no `updatePolicy` path). Known limitations listed beats pretending — ETHGlobal judges consistently reward teams that know their attack surface.

## 6. Out of Scope

ERC-4337 / modules / proxies · multi-owner · gas abstraction · x402 settlement (roadmap) · cross-chain · token launches · on-chain reputation *writing* (read-only integration).
