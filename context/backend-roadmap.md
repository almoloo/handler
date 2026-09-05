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

## 3. Database Schema (Prisma sketch)

```prisma
model Agent {          // both user-hired agents and counterparties
  id            String  @id            // erc8004 agentId or synthetic
  address       String  @unique
  name          String
  kind          AgentKind              // HIRED | COUNTERPARTY | VILLAIN
  trustTier     TrustTier              // VERIFIED | NEW | FLAGGED
  trustDetail   Json                   // attestation counts, source: chain|fixture
  frozen        Boolean @default(false)
  policy        Policy?
  activity      ActivityEvent[]
}

model Policy {
  agentId        String  @id
  dailyCapUsd    Decimal
  perTxCapUsd    Decimal
  cosignAboveUsd Decimal
  allowSwaps     Boolean
  allowUnknown   Boolean
  payAgentsTier  TrustTier             // minimum counterparty tier
  sessionKey     String  @unique       // the agent's session key inside the single HandlerWallet
  syncedBlock    BigInt                // last block this mirror was reconciled
  // NB: there is ONE HandlerWallet per user (contracts roadmap §2) — its address
  // lives in app config, not per-policy. Agents are session keys within it.
}

model ActivityEvent {
  id         String   @id @default(cuid())
  agentId    String
  type       EventType   // SWAP | AGENT_PAYMENT | BLOCKED | PENDING | APPROVED | DENIED | FREEZE
  amountUsd  Decimal?
  token      String?
  counterparty String?
  txHash     String?  @unique
  blockNo    BigInt?
  summary    String      // pre-written plain-English line the UI renders verbatim
  createdAt  DateTime @default(now())
}

model PendingApproval {
  id         String   @id             // deterministic: policyAddr + nonce
  agentId    String
  amountUsd  Decimal
  calldata   String
  decoded    Json                     // human-readable intent for the approval sheet
  status     ApprovalStatus           // PENDING | APPROVED | DENIED | EXPIRED
  createdAt  DateTime @default(now())
}

model DemoRun {
  id        String  @id @default(cuid())
  beat      Int
  status    String
  log       Json
  createdAt DateTime @default(now())
}
```

Design note: `summary` is written server-side at index time — the backend owns copy for events, so the frontend renders strings and the video never shows a formatting bug.

---

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
