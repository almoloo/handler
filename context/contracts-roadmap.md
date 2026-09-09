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
| Feeds | Chainlink AggregatorV3 (ETH/USD, USDC/USD) | USD-denominated caps — a real integration, but on its own doesn't qualify for ETHOnline 2026's open Chainlink prize (that needs a Confidential Workflow; see backend roadmap §4.5, a backend-side stretch, not a contracts change) |
| Trust | ERC-8004 Identity + Reputation registry reads | The differentiator |
| Typegen | forge build artifacts → wagmi/viem codegen in `packages/contracts` | One ABI source for web + api |

**Chain: Base mainnet (8453)** — the original plan targeted Base Sepolia for a cheap, fast-retake testnet, but ERC-8004's Identity + Reputation registries have no code on Base Sepolia (or any other testnet checked: Ethereum, OP, Arbitrum Sepolia) — only Base mainnet, where Chainlink's feeds also live. Moved for real per `context/current-feature.md`'s "Move the public deployment to Base mainnet" fix; retakes cost real (small) gas.
1inch is not part of the product (cut — its API key requires KYC the team won't complete; see `project-overview.md`). The public deployment is Base mainnet, plain. `allowSwaps`/`SwapsNotAllowed()` remain as a generic policy-engine classification (swap-router-shaped calls vs. plain transfers vs. unknown contracts) — no product feature currently routes a real swap through it, so it's exercised by tests only.

---

## 2. Architecture (3 contracts + 1 reader)

```
HandlerWalletFactory ──deploys──▶ HandlerWallet (one per user, holds funds)
                                     │ consults
                                     ▼
                                 TrustReader (ERC-8004 → tier, read-only)
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
- The real ERC-8004 Identity Registry (`getAgentWallet(agentId) -> address`) has **no reverse index** — no on-chain address→agentId lookup exists, and enumerating all agentIds inside `tierOf()` is unbounded gas. So `tierOf(address)` cannot be a pure stateless proxy; `TrustReader` keeps a small on-chain cache instead:
  - `agentIdOf[address]` cache, populated only by **`syncAgent(uint256 agentId)`** — permissionless (anyone can call), and trustless: it reads `getAgentWallet(agentId)` from the real Identity Registry itself and caches that claim, so it's a verified on-chain fact, not an assertion. This is not an override path — nobody can set an arbitrary tier or mapping; they can only ask the contract to re-check the canonical registry.
  - `tierOf(account)`: no cached agentId → `FLAGGED`. Cached → pull that agent's feedback via `readAllFeedback(agentId, [], "", "", false)` (the one Reputation Registry call that aggregates *all* clients without a caller-supplied allowlist) and average on-chain → map count/average to `VERIFIED | NEW | FLAGGED` (thresholds constant, mirrored in the backend `trust/` module).
  - `scripts/register-agents.ts` calls `syncAgent` right after registering each showcase counterparty so the demo path is warm.
  - **Known limitation (disclosed, not hidden):** if a synced agent's real registry wallet later changes, the cache is stale until someone calls `syncAgent` again — same class of staleness the backend's trust cache already documents for an unreachable registry.
- **No override path.** The current `setOverride` stub is transitional; the feature that lands real registry reads deletes it (and its event/tests) so the deployed contract has no owner-settable tier. Demo determinism comes from the showcase counterparties being *really registered* with *real* reputation entries, created once by a disclosed setup script — the product never writes reputation, but registering our own agents at setup time is allowed.
- Unregistered (or un-synced) address → `FLAGGED` by default (secure default doubles as the villain setup: the villain simply never registers).
- Registry addresses are constructor-immutable; if a registry call reverts, `tierOf` returns `FLAGGED` (fail closed) rather than reverting the whole execution.

### 2.3 PriceConverter
- Chainlink round read with staleness check (`updatedAt` window, revert `StalePrice()`), decimals normalization, ETH + configured ERC20s → USD-8. Feed addresses are set once by the owner per token (`setFeed`), which is configuration, not a price: there is no `setRate`-style path that lets anyone assert a USD value. The current owner-settable-rate stub is transitional and is deleted by the feature that lands the Chainlink reads.
- Neither stub (`TrustReader.setOverride`, `PriceConverter.setRate`) may ever be part of a public deployment; `DeployDev.s.sol` is the only script allowed to reference them, and only until they are gone.

### 2.4 HandlerWalletFactory
- `createWallet(owner)` + deterministic address (CREATE2) so the frontend can precompute; emits `WalletCreated`.

---

## 3. Testing Plan (Foundry)

- **Unit:** every custom error has a test that triggers it; epoch-roll math at boundaries (23:59:59 vs 24:00:01); price decimals for ETH + USDC paths.
- **Fuzz:** random amounts/sequences vs caps — invariant: `spentThisEpoch ≤ dailyCapUsd` always.
- **Invariant test:** wallet balance can only decrease via `Executed` or `Approved` paths.
- **The demo test:** one Foundry script that replays beats 1–4 exactly — this is the contract lane's smoke test and doubles as the backend's integration fixture.
- Skip: formal verification, gas golf, slither beyond a single default run on day 7.

---

## 4. Day-by-Day (Solidity lane)

| Day | Goal | Exit criterion |
|---|---|---|
| 1 | Repo/Foundry setup in monorepo, interfaces drafted | `packages/contracts` builds |
| 2 | HandlerWallet core: policies, caps, epoch, tryExecute/execute, **events + errors frozen**; **first dev deployment** (chosen chain/anvil) with a pre-created dev wallet, address in shared config, redeployed daily as WIP evolves | Backend indexer unblocked against live logs |
| 3 | TrustReader real ERC-8004 reads (stub + `setOverride` removed) wired into checks; **session interface frozen** | Riley (backend) unblocked; villain block (`ExecutionBlocked` via `tryExecute`) green in tests against a registry mock *in the test file only*, plus a fork test against the real registries |
| 4 | PriceConverter real Chainlink reads + staleness (stub + `setRate` removed); propose/approve/deny queue | Co-sign loop green in tests; `StalePrice()` has a test |
| 5 | Factory + CREATE2; deploy scripts; formal testnet/fork deployment (frontend switches hire flow from the dev wallet's direct `hireAgent` to the factory) | Frontend hire flow has a real target |
| 6 | Fuzz + invariant suite; fix findings; demo-replay script | Beats 1–4 green from forge script |
| 7 | Freeze. Slither pass, README security notes, final deploy, verify on explorer | Verified contracts, addresses committed to shared config |
| 8–9 | On call for backend/video; no changes except red-alert fixes | — |

---

## 5. Security Notes for the README (judges read these)

Honest scope statement: single-owner wallet, no upgradeability, trust tiers read-only from ERC-8004 with no override, price staleness bounded, reentrancy guarded, session keys can *never* change policy or withdraw to themselves (explicit check: target ≠ sessionKey, no `updatePolicy` path). Disclose that the showcase counterparties were registered by the team's own setup script. Known limitations listed beats pretending — ETHGlobal judges consistently reward teams that know their attack surface.

## 6. Out of Scope

ERC-4337 / modules / proxies · multi-owner · gas abstraction · x402 settlement (roadmap) · cross-chain · token launches · on-chain reputation *writing* (read-only integration).
