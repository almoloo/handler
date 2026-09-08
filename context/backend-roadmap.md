# Handler — Backend Roadmap (NestJS + Postgres, End-to-End)

**Role of the backend:** it is the server side of a real product. It indexes the chain into Postgres so the frontend gets clean, decoded data for *any* signed-in wallet, computes trust tiers from the ERC-8004 registries, serves prices from Chainlink, hosts the catalog agents' runtime, and exposes an isolated operator tool that triggers real agent actions for the demo video. Choices are simple (modular monolith, cron, no queues) because the timeline is 10 days — not because the app is a throwaway. Every choice must hold up for a stranger who signs in with their own wallet.

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
| Auth | SIWE (`siwe` package) + signed, HTTP-only session cookie | Real login tied to the owner's wallet, no separate password/account system |
| Agent secret custody | Ledger Key Ring CLI (`@ledgerhq/wallet-cli` ≥ 2.1, `wallet-cli ring encrypt/decrypt`) | Ledger track's "agents that use secrets they cannot leak" criterion — Riley's session key lives on the host only as Key Ring ciphertext (keys derived from the Ledger seed), decrypted into the process env at boot; never plaintext in Coolify config |
| Deploy | Your VPS (Docker Compose: api + postgres) or Railway | Whichever you can stand up in <1 hour on day 1 |
| Monorepo | pnpm workspaces: `apps/web`, `apps/api`, `packages/contracts` | ABIs + types generated once from the Solidity build, imported everywhere |

---

## 2. Module Map

```
apps/api/src/
  auth/         SIWE nonce issuance + verification, session cookie guard
  chain/        viem clients, contract bindings, tx helpers, nonce mgmt
  indexer/      cron: pull logs → decode → upsert into Postgres
  agents/       the catalog agent runtime (Riley, the verified subcontractor)
  trust/        ERC-8004 Identity + Reputation reads → trust tiers (chain only)
  policies/     mirror of on-chain policy state + write endpoints
  activity/     REST + SSE serving the feed & pending approvals
  prices/       Chainlink feed reads, cached USD conversions
  demo/         operator tooling (env-gated): triggers beats 1–4 against the showcase wallet, runs the villain actor, reset
  health/       /health for the video-day sanity check
```

**Dependency rule:** `agents`, `indexer`, `demo` may depend on `chain`; `activity`, `policies`, `trust`, `prices` are read/serve modules the frontend hits. `auth` depends on nothing but Postgres (sessions table) and is applied as a guard in front of every `/app`-serving route — reads and writes alike — with results filtered by the session's wallet address. The villain (an unregistered, zero-reputation actor) lives in `demo/`, not `agents/`: it is an adversarial test actor, not a product agent. Nothing circular, no shared mutable state outside Postgres.

---

## 3. Database Schema

The schema is final for the hackathon and lives in `apps/api/prisma/schema.prisma` (11 models, 12 enums, doc-commented). Do not re-sketch it here; read the file. Conventions are in its header: lowercase addresses, USD as 8-decimal `BigInt`, raw token amounts as `Decimal(78,0)`, chain rows idempotent by natural key, `summary` copy written server-side.

Deviations from the original sketch, each deliberate:

| Sketch | Schema | Reason |
|---|---|---|
| Wallet address "lives in app config" | `Wallet` table indexed from `WalletCreated`; config holds only the factory address plus the showcase wallet's address for the `demo` module | Any signed-in wallet creates its own `HandlerWallet`; the showcase wallet is an ordinary row, not a special case in product code. |
| `Agent 1:1 Policy` | `Agent 1:N Policy`, unique on `(walletAddress, sessionKey)` | Same catalog agent (Riley) can be hired by many wallets. |
| `Decimal` USD | `BigInt` for USD-8, `Decimal(78,0)` for raw token/wei amounts | Postgres `BIGINT` is int64, which overflows at ~9.2 ETH in wei. |
| `txHash @unique` | `@@unique([txHash, logIndex])` | One tx can emit several indexed logs (e.g. `Approved` + `Executed`). |
| `syncedBlock` on `Policy` | `IndexerCursor` table keyed by stream name | One cursor per log stream (factory, each wallet), advanced in the same transaction as the upserts. |
| No intent table | `Intent` table | §4.2 "intent-row-first" rule needs a home that is *not* the chain-derived feed. |
| `DemoRun.status String` | `DemoRunStatus` enum + `DemoSnapshot` | Local anvil dev-chain reset uses `evm_snapshot`/`evm_revert`; the snapshot id must survive an api restart. |

Schema debt to clear in a follow-up fix once `trust/` lands: `TrustSource.FIXTURE`/`OVERRIDE`, `Agent.isSeeded`, and the `Agent.trustSource` default of `FIXTURE` describe a fixture path that no longer exists — runtime code must never write those values; the enum collapses to `CHAIN`.

Two derived values that must **not** become columns: spent-today (`Policy.spentThisEpochUsd`, reported as 0 when `now > epochStart + 86400` because the contract rolls the epoch lazily) and wallet/agent balances (live `chain` reads, cached in memory).

Contracts coordination: `PendingApproval` needs `target`, `calldata`, `value`, and `usdValue` at index time, so the `Proposed` event must carry them (or the proposal must be readable by id) before the day-2 event freeze.

## 4. Core Services

### 4.1 Indexer
- Cron every 3s: `getLogs` from the policy wallet contracts since `syncedBlock`, decode with shared ABIs, upsert `ActivityEvent` + `PendingApproval`, advance the cursor in the same transaction (idempotent by `txHash`).
- Blocked attempts are **not reverts**: agents call the wallet's `tryExecute()`, which emits `ExecutionBlocked(sessionKey, reason, usdValue)` as a successful tx (contracts roadmap §2.1). The indexer maps the reason enum to plain English ("unverified counterparty", "over daily allowance") — no trace parsing anywhere.
- Push each new row to the SSE broadcaster.

### 4.2 Agent runtime
Each catalog agent = a Nest service holding a viem `walletClient` on its **session key** — the backend never holds the owner key. The owner is the user's wallet in the frontend (Ledger/browser via wagmi). A catalog agent serves every wallet that hired it: when it acts, it iterates the wallets where its session key holds an active policy. The demo-reset tool uses a separate **faucet key** that only tops up the showcase wallet's balances and can't touch policies.

**Ledger track pivot (planned, not yet implemented):** Riley's session key (`RILEY_SESSION_KEY`) is currently a plaintext value in Coolify's env. The Ledger "AI Agents x Ledger" track requires the **Ledger Key Ring CLI** (`wallet-cli ring`, part of `@ledgerhq/wallet-cli`). What it actually is (verified against the CLI's `--help` and Ledger's docs, not assumed): hardware-rooted *encryption at rest* — `ring init` enrolls a machine once with the device present, then `ring encrypt --key <scope>` / `ring decrypt --key <scope>` run headless (network needed to restore the trustchain, no device), with the member password supplied via `WALLET_PASS` from a keychain/secret store, never literally. It is **not** a remote transaction signer — Riley still signs locally with viem, exactly as today.

The pivot therefore is: commit the agent secret as Key Ring ciphertext (`secrets/handler-prod.enc`, scope key `handler-prod`), and have the api container's entrypoint run `wallet-cli ring decrypt` and export the result into the process env before `node dist/main.js`. `agents.config.ts` and the frozen `tryExecute()` session interface don't change. **First spike of the implementing feature:** how the VPS becomes a Key Ring member (whether `ring init` can enroll a host with no USB port, or member credentials are provisioned from the laptop) — this is precisely Ledger's "bring the Key Ring to hosts with no USB port: enroll a VPS or hosted agent" priority area, so document whichever path works (their Telegram support group is listed on the track page).

How this maps to the track's four priority areas: (1) *secrets they cannot leak* — Key Ring custody above; (2) *hosts with no USB port* — the Coolify VPS enrollment; (3) *human-in-the-loop, Ledger approves high-risk actions* — the frontend's existing DMK co-sign above `cosignAboveUsd`; (4) *x402-style payment flows* — out of scope, say so. Handler's own design already embodies their stated pattern ("a broker hands out scoped capabilities, never the API key"): the owner's Ledger never leaves the device, and the agent receives a scoped on-chain capability (session key + policy), not the owner key — lead with that in the README and video. Ledger also judges partly on **Developer Experience feedback**, so a short `docs/ledger-feedback.md` (what worked, what was confusing, in Key Ring, DMK, and the wallet-cli skill) is a submission deliverable, not optional.
- **Riley:** holds its own session-key signer and self-registers in the catalog (`agents.service.ts`'s `onModuleInit`) — that's the key the Ledger Key Ring custody story is built around. Riley's 1inch-swap "run now" was cut (1inch is no longer part of the product; see `project-overview.md`) and not yet replaced: Riley has no live action until it can pay the subcontractor agent below through `tryExecute()`, which is this section's next build target.
- **Subcontractor (verified):** a real ERC-8004-registered agent that exposes a paid task; Riley pays it through the policy wallet (beat 2 is one such payment) once Riley's payment action is built. Above `cosignAboveUsd`, Riley calls `propose()` instead — that is beat 4, and it is the same code path for any wallet.
- **Villain (zero reputation):** lives in `demo/`, not here. It is an unregistered address that attempts a $500 charge through `tryExecute()` and gets `ExecutionBlocked` — a real tx, blocked by the real trust check (unregistered ⇒ FLAGGED), with no override anywhere.
- All agent actions write an *intent* row first, then the tx — so even a failed RPC shows up in the feed as a coherent story.

### 4.3 Trust service
- One implementation: `ChainTrustSource`, reading the ERC-8004 Identity + Reputation registries via viem. No fixture source, no env flag, no fallback data. If the registries are unreachable, the cached tier stays as-is and `trustSummary` says so ("Couldn't refresh trust"); an agent with no cached tier is FLAGGED.
- The showcase counterparties (subcontractor = Verified, a second catalog agent = New) get their tiers by *actually being registered* in the Identity Registry and carrying real Reputation entries, created once by a disclosed setup script (`scripts/register-agents.ts`, run against the fork/testnet). The product itself never writes reputation.
- Maps raw data → `VERIFIED | NEW | FLAGGED` + a one-line `trustSummary` explanation. Cached in the `Agent` row, refreshed on a 60s cron. Tier thresholds mirror `TrustReader.sol` exactly so the badge the UI shows is the tier the contract enforced.

### 4.4 Prices
- Chainlink feed reads (ETH/USD, USDC/USD) with the same staleness window as `PriceConverter.sol`, cached 30s; exposes `/prices` and is used server-side to stamp `amountUsd` on events. Keeps the UI's USD framing consistent with what the contracts enforced. No hardcoded rate fallback: if the feed is stale, `/prices` reports it as stale and the UI says so.

### 4.5 Chainlink Confidential Workflow (stretch, not locked scope)
Plain `AggregatorV3` price reads (§4.4) don't qualify for any open ETHOnline 2026 Chainlink prize — the only non-Continuity track is "Best Confidential Workflow" ($2,000, up to 2 teams), which requires a CRE workflow that registers a confidential TEE handler (`handlerInTee` / `cre.HandlerInTee`) processing at least one genuinely sensitive input inside the enclave, demonstrated via `cre workflow simulate` or a live deployment. Trust tiers and policy thresholds are public on-chain data, so wrapping those would read as a placeholder. **Open question:** the previous candidate sensitive input was the 1inch API key (now cut — see `project-overview.md`); no replacement genuinely-sensitive input in Riley's loop has been identified yet. This stretch stays parked until one is found — don't invent a placeholder just to keep the stretch alive. If none turns up by day 7's feature freeze, drop it, no sunk cost.

### 4.6 Demo director (operator tooling, not product)
- Whole module is registered only when `DEMO_ENABLED=true`; every route requires a valid SIWE session whose address owns the showcase wallet **and** the `DEMO_TOKEN` header.
- `POST /demo/beat/:n` (1–4, matching the frontend director screen) — triggers the *real* action for the showcase wallet: 1 = Riley "run now"; 2 = Riley pays the subcontractor; 3 = the villain actor calls `tryExecute()` and is blocked on-chain; 4 = Riley proposes above the co-sign cap. Logs to `DemoRun`. Nothing here bypasses policy, trust, or price checks.
- `POST /demo/reset` — restores the showcase wallet for a retake. Locally (`pnpm dev:chain`'s anvil) it is `evm_revert` to the post-setup snapshot + re-snapshot + cursor rewind, near-instant. On the public Base Sepolia deployment it tops up balances from the faucet, unfreezes the showcase wallet's agents via real owner txs, and deletes **only** rows whose `walletAddress` is the showcase wallet before re-indexing. It never truncates a table and never touches another wallet's rows. Target: < 30s, idempotent, safe to mash.
- Never linked from the app's navigation; the `/demo` page 404s unless the flag is on.

---

## 5. API Surface (what the frontend consumes)

```
GET  /agents                     payroll list for the session's wallet (policy + trust + spent-today)
GET  /agents/catalog             hireable catalog agents with live trust tiers (hire picker step 1)
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

POST /auth/nonce                 { address } → one-time SIWE nonce
POST /auth/verify                { message, signature } → verifies SIWE message, issues session cookie
POST /auth/logout                clears the session cookie
GET  /auth/session               current session's address, or 401
```

Auth: real SIWE-based session auth — the owner signs a SIWE message with their connected wallet (`/auth/nonce` → sign → `/auth/verify`), the API issues a signed, HTTP-only session cookie scoped to that address. **Every** `/agents*`, `/activity`, `/events/stream`, and `/approvals*` route requires a valid session and returns or mutates only rows for wallets owned by the session address (multi-user by construction: one `HandlerWallet` per owner, resolved from the `Wallet` table). Writes additionally verify the wallet the write claims to act for belongs to the session. Public routes are `/health`, `/prices`, and `/auth/*` only. The demo director (`/demo/*`) is gated by `DEMO_ENABLED`, session auth, and its header token.

---

## 6. Day-by-Day (backend lane)

| Day | Backend goal | Exit criterion |
|---|---|---|
| 1 | Monorepo, Nest scaffold, Prisma + Postgres up, viem clients, env validation | `/health` green on deployed VPS |
| 2 | Shared `packages/contracts` typegen; indexer walking logs from the contracts lane's **day-2 dev deployment** into Postgres | Events from a manual tx appear as rows |
| 3 | `agents` runtime: Riley's signer + catalog self-registration (session interface frozen this day); `auth` module: SIWE nonce/verify + session cookie guard on every `/app` route, reads scoped by wallet | Every `/agents*`/`/activity`/`/approvals*` route 401s without a session and never leaks another wallet's rows (e2e) |
| 4 | Trust service (ERC-8004 chain reads) + `scripts/register-agents.ts` · activity REST + SSE | Frontend feed reads live API data; catalog agents show real registry-derived tiers |
| 5 | Hire-metadata endpoint + freeze/approval event handling in indexer · prices module | Frontend hire flow end-to-end |
| 6 | Approvals pipeline (pending rows + approved/denied callbacks) · subcontractor + villain agents · Riley's payment-to-subcontractor action (replaces the cut 1inch swap) · **Ledger track pivot: `RILEY_SESSION_KEY` becomes Key Ring ciphertext decrypted at container boot (§4.2); VPS enrollment path documented** | Beats 2–4 run from curl; no plaintext agent secret in Coolify config; `docs/ledger-feedback.md` started |
| 7 | Demo director + reset hardened; **feature freeze at EOD** on locked scope | Beats 1–4 + reset, 3 consecutive clean runs; a second, non-showcase wallet is untouched by reset (e2e) |
| 8 | Failure drills: RPC flake, double-fire beats, restart mid-take; showcase agents' on-chain registrations final · **stretch:** Chainlink Confidential Workflow (§4.5), attempted only if 8's failure drills are already clean | Reset < 30s, beats idempotent |
| 9 | Video day: backend on standby, `/health` open in a tab, no deploys | — |

Coordination points with the Solidity lane: event signatures (incl. the `ExecutionBlocked` reason enum) + custom errors frozen by **end of day 2** (indexer depends on them); `tryExecute()`/session interface frozen by **day 3** (Riley depends on it — the frozen shape is documented at `apps/api/src/agents/agents.module.ts`); a dev deployment must exist from day 2 (contracts roadmap day-by-day).

---

## 7. Risk Rules

- If a day-4+ slip forces cuts, cut in order: Chainlink Confidential Workflow stretch (§4.5, cut first — it's not locked scope) → subcontractor agent (merge beat 2 into beat 1) → SSE (frontend falls back to 3s polling) → `/agents/catalog` blurbs/avatars. **Never cut:** indexer, auth scoping, real Chainlink prices, real ERC-8004 trust, reset, villain beat, the Ledger Key Ring CLI pivot (it's the primary partner-track target — losing it drops the project from Ledger track eligibility entirely). A cut feature is removed from the UI, never replaced with a hardcoded value.
- Every agent action is intent-row-first, so a mid-take crash still leaves a coherent feed.
- Tests are not optional: unit tests for every service (policy-mirror math, log decoding, trust mapping, price staleness, agent runtime) and e2e tests for every route (auth + wallet scoping). `scripts/smoke.ts` runs all beats headless against a live stack on top of that — run it every morning as the integration check, not as a substitute for tests.

## 8. Explicitly Out of Scope

Account systems beyond one SIWE session per connected wallet (no email/password, no org/team accounts — but *any* wallet can sign in and own its own Handler wallet) · Redis/queues · subgraph · websockets · multi-chain · retries beyond simple idempotency · admin UI (the demo director is curl/Postman + the hidden /demo page) · x402 endpoints (roadmap slide only).
