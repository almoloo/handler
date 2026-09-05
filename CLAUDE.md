# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Handler — "the banking app for your AI." A consumer app that lets a person hire an AI agent, give it an on-chain spending policy (allowance, allowlist, co-sign threshold, minimum counterparty trust tier), and have those rules enforced on-chain — including rules that adapt to a counterparty agent's ERC-8004 reputation. Built for ETHGlobal ETHOnline 2026 (Sept 4–16), targeting the Ledger, Chainlink, and 1inch tracks.

Full product spec: `context/project-overview.md`. This project is scaffolded very early — `apps/api` and `apps/web` are currently near-stock Nest/Next.js starters; `packages/contracts` has no Solidity sources yet beyond the Foundry template.

## Context-driven workflow (read this first)

This repo is managed through a `context/` folder and a matching set of slash-command skills. **Follow the workflow in `context/ai-interaction.md` — it is the actual operating procedure for this repo, not just background reading.** Key points:

- `context/project-overview.md` — product spec / scope (locked hackathon scope; don't add out-of-scope features — see its "Out of scope" list).
- `context/coding-standards.md` — per-part conventions (below is a summary; that file is authoritative).
- `context/ai-interaction.md` — the required workflow: document the feature in `context/current-feature.md` → branch → implement → codegen if contracts changed → test → commit (only after tests pass, only with permission) → merge → delete branch → log it in `current-feature.md` history.
- `context/current-feature.md` — the in-flight feature/fix spec and history log. Check this before starting work to see what's already in progress.
- Slash commands `/feature`, `/fix`, `/implement`, `/complete`, `/audit`, `/overview` drive this workflow — prefer them over ad hoc changes.
- Never commit without explicit permission, and only after the relevant build/tests pass.
- Never delete files without clarification. Ask before large refactors or cross-part architectural changes (e.g. a contracts change that requires an indexer or frontend type change — confirm before touching the second part).

## Commands

Repo uses pnpm workspaces (`apps/*`, `packages/*`), pnpm 12.

```bash
pnpm install               # install all workspace deps
pnpm dev                   # run web + api in parallel (pnpm --filter web --filter api dev)
pnpm dev:chain             # docker compose up -d postgres anvil (local Postgres + forked Anvil chain)
pnpm codegen               # regenerate @handler/contracts ABIs/types (forge build && wagmi generate)
pnpm build                 # build all workspace packages (pnpm -r build)
pnpm smoke                 # tsx scripts/smoke.ts
```

Per-part commands (run from repo root with `--filter`, or `cd` into the part):

```bash
# apps/web (Next.js, App Router)
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web lint

# apps/api (NestJS)
pnpm --filter api start:dev
pnpm --filter api build
pnpm --filter api test              # vitest unit tests
pnpm --filter api test:e2e          # vitest e2e config
pnpm --filter api test -- <pattern> # single test file/pattern
pnpm --filter api lint              # oxlint

# packages/contracts (Foundry)
cd packages/contracts
forge build
forge test
forge test --match-test <testName>  # single test
forge fmt
```

Local chain/db: `docker-compose.yml` defines `postgres` (5432) and `anvil` (8545, forked from `$BASE_RPC_URL`) — see `.env.example` for required env vars.

## Architecture

Monorepo, three parts with a one-way dependency: contracts → api/web (via generated types), api and web talk over REST/SSE only (web never reads chain state directly for anything the API surfaces).

- **`packages/contracts`** (Foundry/Solidity, OpenZeppelin, Chainlink AggregatorV3, ERC-8004 registry reads): the wallet/policy contracts. ABIs and TypeScript types are generated into `packages/contracts/ts/generated.ts` via `@wagmi/cli`'s Foundry plugin (`pnpm codegen`) and consumed by both apps as the `@handler/contracts` workspace package. **Never hand-edit `generated.ts`** — regenerate it, and commit the regen in the same commit as the Solidity change that caused it.
- **`apps/api`** (NestJS + Prisma/Postgres + viem): reads chain state via a cron-based indexer (no queue infra) and serves it over REST/SSE. Planned module split (per `context/coding-standards.md`): `chain/`, `indexer/`, `agents/`, `trust/`, `policies/`, `activity/`, `prices/`, `demo/`, `health/`. Dependency rule: `agents`/`indexer`/`demo` may depend on `chain`; `activity`/`policies`/`trust`/`prices` are read-only serve modules. Prisma is the only DB access layer. Chain-derived rows must be idempotent by a natural key (`txHash`, deterministic `PendingApproval.id`) so the indexer can safely re-run.
- **`apps/web`** (Next.js App Router + wagmi/viem + TanStack Query + Ledger Device Management Kit): all reads come from the API (never poll contract logs client-side); all writes (hire, freeze, approve, deny) are owner-signed client-side via wagmi — the app never handles a private key/seed phrase and never asks the backend to sign for the owner. Co-signing above the policy threshold goes through Ledger.

### Cross-cutting conventions worth knowing before editing anything

- **Money**: all USD values crossing a contract↔API↔UI boundary are 8-decimal fixed-point integers (Chainlink `AggregatorV3` convention) until the final UI render — never store/pass a floated dollar value. Token amounts use the token's native decimals (fetched, never assumed to be 18).
- **Blocked ≠ revert**: contract-level policy failures must emit an event (`ExecutionBlocked`) rather than just reverting, so they're indexable/demo-able. New policy checks follow the existing `tryExecute()`/`execute()` split, not a bare `revert`. Every distinct failure mode gets its own custom error (no generic/collapsed errors).
- **Session-key invariant**: a session key can never change policy or self-withdraw. Any new contract function must preserve `target != sessionKey` and must not expose an `updatePolicy` path reachable from a session key.
- **No demo faking**: every "blocked"/"approved" moment shown in the app or demo video must be a real on-chain tx — never mock/hardcode for a smoother demo. `/demo` and `POST /demo/reset` are hackathon-only tooling, kept separate from user-facing code paths.
- **No user-facing jargon**: no hex addresses, "ERC-8004", "session key", etc. visible on any screen — truncate/name everything, plain fintech English.
- Explicitly out of scope for the hackathon: multi-chain, mobile-native, full x402, ERC-4337/account abstraction, on-chain reputation *writing*, dark mode.
