# Handler — Backend Roadmap (NestJS + Postgres, End-to-End)

**Role of the backend:** it is the *stage crew* of the demo. It runs the agents themselves, indexes the chain into Postgres so the frontend gets clean data fast, computes trust tiers, and drives the scripted demo beats. Nothing here is user-facing infrastructure for scale — every choice optimizes for reliability across 5+ video takes.

One change vs. the frontend roadmap: the frontend **no longer polls raw chain logs** — it consumes this backend's REST/SSE API. Cleaner data, decoded once, and the video never stutters on RPC hiccups.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | NestJS (modular monolith, single deployable) | One repo, one process — no microservice tax in 10 days |
| ORM | Prisma + Postgres | Fast schema iteration, typed client shared with scripts |
| Chain | viem (`publicClient` + `walletClient` per agent) | Same lib as frontend = shared ABI/typegen package |
| Scheduling | `@nestjs/schedule` cron + in-process job runner | No Redis/BullMQ — the queue is Postgres rows + a 3s tick |
| Realtime | SSE endpoint (`/events/stream`) | Simpler than websockets; one-directional is all the UI needs |
| Config | `@nestjs/config` + zod-validated env | Fail fast on missing keys during setup |
| Deploy | Your VPS (Docker Compose: api + postgres) or Railway | Whichever you can stand up in <1 hour on day 1 |
| Monorepo | pnpm workspaces: `apps/web`, `apps/api`, `packages/contracts` | ABIs + types generated once from the Solidity build, imported everywhere |

---

## 2. Module Map

```
apps/api/src/
  chain/        viem clients, contract bindings, tx helpers, nonce mgmt
  indexer/      cron: pull logs → decode → upsert into Postgres
  agents/       the agent runtime (good agent, subcontractor, villain)
  trust/        ERC-8004 reads + seeded fixtures → trust tiers
  policies/     mirror of on-chain policy state + write endpoints
  activity/     REST + SSE serving the feed & pending approvals
  prices/       Chainlink feed reads, cached USD conversions
  demo/         director endpoints: beats 1–5, reset, seeding
  health/       /health for the video-day sanity check
```

**Dependency rule:** `agents`, `indexer`, `demo` may depend on `chain`; `activity`, `policies`, `trust`, `prices` are read/serve modules the frontend hits. Nothing circular, no shared mutable state outside Postgres.

---

## 3. Database Schema

The schema is final for the hackathon and lives in `apps/api/prisma/schema.prisma` (11 models, 12 enums, doc-commented). Do not re-sketch it here; read the file. Conventions are in its header: lowercase addresses, USD as 8-decimal `BigInt`, raw token amounts as `Decimal(78,0)`, chain rows idempotent by natural key, `summary` copy written server-side.

Deviations from the original sketch, each deliberate:

| Sketch | Schema | Reason |
|---|---|---|
| Wallet address "lives in app config" | `Wallet` table indexed from `WalletCreated` (demo wallet address *also* stays in config) | Factory + CREATE2 lands day 5 and the live link must survive a judge creating their own wallet. |
| `Agent 1:1 Policy` | `Agent 1:N Policy`, unique on `(walletAddress, sessionKey)` | Same catalog agent (Riley) can be hired by the demo wallet *and* a judge's wallet. |
| `Decimal` USD | `BigInt` for USD-8, `Decimal(78,0)` for raw token/wei amounts | Postgres `BIGINT` is int64, which overflows at ~9.2 ETH in wei. |
| `txHash @unique` | `@@unique([txHash, logIndex])` | One tx can emit several indexed logs (e.g. `Approved` + `Executed`). |
| `syncedBlock` on `Policy` | `IndexerCursor` table keyed by stream name | One cursor per log stream (factory, each wallet), advanced in the same transaction as the upserts. |
| No intent table | `Intent` table | §4.2 "intent-row-first" rule needs a home that is *not* the chain-derived feed. |
| `DemoRun.status String` | `DemoRunStatus` enum + `DemoSnapshot` | Plan A reset uses `evm_snapshot`/`evm_revert`; the snapshot id must survive an api restart. |

Two derived values that must **not** become columns: spent-today (`Policy.spentThisEpochUsd`, reported as 0 when `now > epochStart + 86400` because the contract rolls the epoch lazily) and wallet/agent balances (live `chain` reads, cached in memory).

Contracts coordination: `PendingApproval` needs `target`, `calldata`, `value`, and `usdValue` at index time, so the `Proposed` event must carry them (or the proposal must be readable by id) before the day-2 event freeze.

## 4. Core Services

### 4.1 Indexer
- Cron every 3s: `getLogs` from the policy wallet contracts since `syncedBlock`, decode with shared ABIs, upsert `ActivityEvent` + `PendingApproval`, advance the cursor in the same transaction (idempotent by `txHash`).
- Blocked attempts are **not reverts**: agents call the wallet's `tryExecute()`, which emits `ExecutionBlocked(sessionKey, reason, usdValue)` as a successful tx (contracts roadmap §2.1). The indexer maps the reason enum to plain English ("unverified counterparty", "over daily allowance") — no trace parsing anywhere.
- Push each new row to the SSE broadcaster.

### 4.2 Agent runtime
Each agent = a Nest service holding a viem `walletClient` on its **session key** — the backend never holds the owner key. The owner is the user's wallet in the frontend (Ledger/browser via wagmi); the demo-reset script uses a separate **faucet key** that only tops up balances and can't touch policies.
- **Good agent ("Riley"):** rebalance loop — reads portfolio, quotes via 1inch API, executes swap *through the policy wallet*. Runs on demand (beat 1), not free-running, so takes are deterministic.
- **Subcontractor (verified):** exposes a paid "task"; Riley pays it through the policy wallet (beat 2).
- **Villain (zero reputation):** attempts the $500 charge (beat 3) and the over-threshold retry path is Riley requesting above `cosignAboveUsd` (beat 4).
- All agent actions write an *intent* row first, then the tx — so even a failed RPC shows up in the feed as a coherent story.

### 4.3 Trust service
- Interface `TrustSource` with two implementations: `ChainTrustSource` (reads ERC-8004 Identity + Reputation registries via viem) and `FixtureTrustSource` (seeded JSON). Resolution order: chain → fixture fallback per agent. Env flag can force fixtures for the video.
- Maps raw data → `VERIFIED | NEW | FLAGGED` + a one-line `trustDetail` explanation. Cached in the `Agent` row, refreshed on a 60s cron.

### 4.4 Prices
- Chainlink feed reads (ETH/USD + stable sanity) cached 30s; exposes `/prices` and is used server-side to stamp `amountUsd` on events. Keeps the UI's USD framing consistent with what the contracts enforced.

### 4.5 Demo director
- `POST /demo/beat/:n` (1–4, matching the frontend demo engine) — runs the corresponding script, logs to `DemoRun`.
- `POST /demo/reset` — the most important endpoint in the repo: refund balances from a faucet wallet, clear `ActivityEvent`/`PendingApproval`/`DemoRun`, reset `frozen` flags, re-seed fixtures, reconcile `syncedBlock`. Target: < 30s, idempotent, safe to mash.
- Guarded by a single header token; never linked from the app.

---

## 5. API Surface (what the frontend consumes)

```
GET  /agents                     payroll list (policy + trust + spent-today)
POST /agents/hire                { name, sessionKey, policy, txHash } → row + summary copy
                                 (the hireAgent TX ITSELF is owner-signed client-side —
                                  this endpoint just registers metadata the chain lacks, e.g. name)
GET  /agents/:id                 agent file (policy sentences data + activity)
GET  /activity?filter=…          paginated feed
GET  /events/stream              SSE: activity + pending approvals, real-time
GET  /approvals/:id              decoded intent for the approval sheet
POST /approvals/:id/approved     optional fast-path callback after the owner-signed approve tx
POST /approvals/:id/denied       optional fast-path callback after the owner-signed deny tx
                                 (approve AND deny are onlyOwner contract calls signed client-side;
                                  the indexer's Approved/Denied events are the source of truth —
                                  callbacks just make the UI instant)
GET  /prices                     cached USD conversions
GET  /health                     RPC block height, DB, agent balances — video-day checklist
```

Auth: none for reads in demo mode (single-user hackathon app); writes gated by the same header token as the frontend build ships. Note this honestly in the README as demo-scope.

---

## 6. Day-by-Day (backend lane)

| Day | Backend goal | Exit criterion |
|---|---|---|
| 1 | Monorepo, Nest scaffold, Prisma + Postgres up, viem clients, env validation | `/health` green on deployed VPS |
| 2 | Shared `packages/contracts` typegen; indexer walking logs from the contracts lane's **day-2 dev deployment** into Postgres | Events from a manual tx appear as rows |
| 3 | `agents` runtime: Riley + 1inch swap through the policy wallet (session interface frozen this day) | Beat 1 runs from a curl |
| 4 | Trust service (chain + fixtures) · activity REST + SSE | Frontend feed switches from mocks to API |
| 5 | Hire-metadata endpoint + freeze/approval event handling in indexer · prices module | Frontend hire flow end-to-end |
| 6 | Approvals pipeline (pending rows + approved/denied callbacks) · subcontractor + villain agents | Beats 2–4 run from curl |
| 7 | Demo director + reset hardened; **feature freeze at EOD** | Beats 1–4 + reset, 3 consecutive clean runs |
| 8 | Failure drills: RPC flake, double-fire beats, restart mid-take; seed data final | Reset < 30s, beats idempotent |
| 9 | Video day: backend on standby, `/health` open in a tab, no deploys | — |

Coordination points with the Solidity lane: event signatures (incl. the `ExecutionBlocked` reason enum) + custom errors frozen by **end of day 2** (indexer depends on them); `tryExecute()`/session interface frozen by **day 3** (Riley depends on it); a dev deployment must exist from day 2 (contracts roadmap day-by-day).

If the 1inch decision lands on **Plan A (anvil fork of Base mainnet)** — see contracts roadmap §1 — the whole stack (indexer, agents, frontend RPC) points at the persistent anvil instance, and `/demo/reset` gets a much better implementation: `evm_snapshot`/`evm_revert` makes reset near-instant. The Base Sepolia deployment then serves only as the public "try it live" link.

---

## 7. Risk Rules

- If a day-4+ slip forces cuts, cut in order: prices module (hardcode a rate) → subcontractor agent (merge beat 2 into beat 1) → SSE (frontend falls back to 3s polling). **Never cut:** indexer, reset, villain beat.
- Every agent action is intent-row-first, so a mid-take crash still leaves a coherent feed.
- Keep one `scripts/smoke.ts` that runs all beats headless — run it every morning; it's your regression suite in lieu of tests you won't have time to write (unit tests only for policy-mirror math and log decoding).

## 8. Explicitly Out of Scope

Auth/users · Redis/queues · subgraph · websockets · multi-chain · retries beyond simple idempotency · admin UI (the demo director is curl/Postman + the hidden /demo page) · x402 endpoints (roadmap slide only).
