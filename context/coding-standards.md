# Coding Standards

This repo has three parts with different conventions: `apps/web` (Next.js), `apps/api` (NestJS), `packages/contracts` (Foundry/Solidity). Shared rules first, then per-part rules.

---

## Shared (all parts)

### TypeScript
- Strict mode enabled everywhere.
- No `any` types — use proper typing or `unknown`.
- Define interfaces/types for all props, API responses, contract call args/returns, and data models.
- Use type inference where obvious, explicit types where helpful.
- Never hand-write a contract ABI type — import it from `@handler/contracts` (generated via `pnpm codegen` in `packages/contracts`). If a type you need isn't exported yet, regenerate; don't recreate it locally.

### Code Quality
- No commented-out code unless specified.
- No unused imports or variables.
- Keep functions under 50 lines when possible.
- Make minimal changes to accomplish the task; don't refactor unrelated code unless asked.

### Money & Units
- All USD amounts that cross a boundary (contract ↔ API ↔ UI) are 8-decimal fixed-point integers (matching Chainlink's `AggregatorV3` convention) until the final render step — convert to a display string only at the UI layer, never store or pass around a floated dollar value.
- Token amounts are always the token's native decimals (fetch, don't assume 18).

---

## `apps/web` (Next.js)

### React
- Functional components only.
- Use hooks for state and side effects; extract reusable logic into custom hooks.
- Keep components focused — one job per component.

### Styling
- Tailwind CSS utility classes + the CSS-variable token set defined in `app/globals.css` (colors, spacing, radii, type scale per `context/frontend-roadmap.md` §2).
- Never hardcode a hex color, spacing number, border radius, or font size directly in a component — use the token classes/variables. If a value isn't in the token set yet, add it there, don't invent a one-off local value.
- No inline `style={{}}` except for values that are genuinely dynamic per-render (e.g. a computed progress-bar width).

### Chain & Data
- All reads (agent list, activity, pending approvals, trust tiers, prices) come from the backend REST/SSE API — never poll contract logs directly from the client. See `context/backend-roadmap.md` §5 for the API surface.
- All writes (hire, freeze, approve, deny) are owner-signed client-side via wagmi — the app never sends a private key or seed phrase anywhere, and never asks the backend to sign on the owner's behalf.
- Use TanStack Query for all backend API calls; no raw `fetch` in components.

### Copy & Jargon
- No hex addresses, contract jargon (ERC-8004, session key), or dev artifacts visible on any user-facing screen — truncate/name everything. See `context/frontend-roadmap.md` §2 copy rules.
- All user-facing text strings should read as plain fintech English, sentence case, active voice.

### File Organization
- Routes: `app/[route]/page.tsx` (App Router conventions).
- Domain components: `components/domain/component-name.tsx` (e.g. `agent-card.tsx`, `trust-badge.tsx`).
- UI primitives: `components/ui/component-name.tsx`.
- Marketing/page-specific sections (not reusable, not backed by domain data): `components/marketing/component-name.tsx` (e.g. `landing-hero.tsx`).
- Hooks: `hooks/use-hook-name.ts`.
- Contract/demo helpers: `lib/contracts.ts`, `lib/demo.ts`.

### Naming
- Files: kebab-case (`trust-badge.tsx`). Components: PascalCase (`TrustBadge`).
- Functions: camelCase. Constants: SCREAMING_SNAKE_CASE. Types/interfaces: PascalCase, no prefix.

---

## `apps/api` (NestJS)

### Structure
- One Nest module per concern, matching `context/backend-roadmap.md` §2: `chain/`, `indexer/`, `agents/`, `trust/`, `policies/`, `activity/`, `prices/`, `demo/`, `health/`.
- Dependency rule: `agents`, `indexer`, `demo` may depend on `chain`; `activity`, `policies`, `trust`, `prices` are read/serve modules only. No circular module dependencies.

### Data
- Prisma is the only DB access layer — no raw SQL except inside a documented migration.
- Every chain-derived DB row must be idempotent by a natural key (`txHash`, or a deterministic `PendingApproval.id`) so the indexer can safely re-run without duplicating rows.
- `ActivityEvent.summary` (the plain-English line the UI renders) is written server-side at index time — never let the frontend construct that copy itself.

### Error Handling
- Use `try/catch` in all async service methods; never let an unhandled rejection kill the indexer cron tick — log and continue to the next tick.
- Use Nest's exception filters for HTTP error responses; don't leak raw error objects/stack traces in API responses.

### Naming
- Files: kebab-case matching Nest conventions (`agents.service.ts`, `agents.controller.ts`).
- DTOs/types: PascalCase, suffixed by role (`HireAgentDto`, `AgentSummary`).

---

## `packages/contracts` (Foundry / Solidity)

### Solidity
- Version 0.8.26+, custom errors (never `require(condition, "string")` for anything checked more than once).
- Every distinct policy-check failure gets its own custom error (`AgentFrozen()`, `ExceedsPerTxCap(usd, cap)`, etc.) per `context/contracts-roadmap.md` §2.1 — don't collapse multiple failure modes into one generic error.
- Blocked agent actions must emit an event (`ExecutionBlocked`), not just revert — reverts aren't indexable. See the `tryExecute()`/`execute()` split in the contracts roadmap; new policy checks go through this pattern, not a bare `revert`.
- No upgradeability, no proxies, no ERC-4337 — out of scope per the contracts roadmap. Don't introduce these patterns even "for future-proofing."
- Reentrancy guard (`nonReentrant`) on every function that does an external call after a state change check.
- Session keys can never change policy or self-withdraw — any new function must preserve `target != sessionKey` and no `updatePolicy` path reachable from a session key.

### Testing
- Every custom error needs a test that triggers it.
- Fuzz tests for anything involving user-supplied amounts against caps.
- The demo-replay Foundry script (`script/DemoReplay.s.sol`) must stay green after any change — treat it as the integration test suite.

### Naming
- Contracts: PascalCase (`HandlerWallet.sol`). Functions: camelCase. Custom errors: PascalCase, no `Error` suffix (`AgentFrozen`, not `AgentFrozenError`).

### Codegen
- Never hand-edit `packages/contracts/ts/generated.ts` — it's produced by `pnpm codegen` (`forge build && wagmi generate`). Run codegen and commit the regenerated file in the same commit as any contract interface change.
