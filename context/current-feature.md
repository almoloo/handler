# Current Feature

## Root layout: providers + viewport + block-color correction

**Status:** Current

### Goal

Finish wiring `apps/web/app/layout.tsx` so the app has a working client
provider tree (wagmi + TanStack Query) and correct mobile viewport behavior,
and fix a color-token conflict discovered while speccing this feature.

### Context — why this is smaller than the original ask

The original ask assumed fonts and design tokens still needed to be built.
They don't: sub-feature **4a (Completed)** already ported the font setup
(`Inter` + `Inter Tight` via `next/font/google`, wired into `layout.tsx`) and a
full `:root` token system into `app/globals.css` — under different, more
extensive names (`--surface-page`, `--text-primary`, `--interactive-primary`,
`--status-approved/-pending/-blocked/-error-*`, etc.) than the
`--paper`/`--ink`/`--field`/`--signal-approve`/`--signal-block`/`--badge-gold`
table originally referenced. Per user decision, 4a's token names are
canonical — this feature does not rename or duplicate them.

What's actually missing: the client provider tree and viewport meta. Plus, a
real conflict surfaced during the duplicate-check: `globals.css` currently
renders **blocked** status in slate and reserves **red** for generic errors,
but `context/frontend-roadmap.md` §2 explicitly defines red as "the villain
color; reserved exclusively for blocks/freezes." Per user decision, the
roadmap wins — this feature corrects the token assignment.

### In scope

- Correct `--status-blocked-*` / `--status-error-*` color assignment in
  `app/globals.css` so red is exclusively the block/freeze signal.
- Viewport meta for mobile-web (pinch-zoom preserved).
- `components/providers.tsx`: wagmi config + TanStack Query client only — no
  theme toggle, no dark mode.
- Wire `<Providers>` into `app/layout.tsx`.

### Out of scope

- Rebuilding/renaming fonts or the token system (4a already did this).
- Any Ledger connector wiring (day-6 work per frontend roadmap §7).
- Navigation, tab bar, or route-group chrome — belongs to the future
  `(main)`/`(flow)` layouts.
- Wallet-connect UI (button, modal) — just the provider plumbing.

### Build steps

- [ ] 1. Swap `--status-blocked-*` to the red ramp and `--status-error-*` to
      the slate ramp in `app/globals.css`; update the stale comment that says
      "blocked is slate, never red." **Done when:** `--status-blocked-fg`
      resolves to a red value and `--status-error-fg` to a slate value, and
      no component currently references these vars yet (4b+ is unbuilt), so
      this is a pure token-file change.
- [ ] 2. Add a `viewport` export to `app/layout.tsx`: `width=device-width,
      initial-scale=1`, no `maximumScale`/`userScalable` override (pinch-zoom
      stays enabled). **Done when:** `next build` includes the viewport meta
      tag in the rendered `<head>` and pinch-zoom is not disabled.
- [ ] 3. Create `apps/web/lib/wagmi.ts`: minimal wagmi config covering the
      local anvil chain (id `31337`, matching `CHAIN_ID` in `.env.example`)
      and Base Sepolia, `http()` transport, `injected()` connector — no
      Ledger connector yet. **Done when:** the config compiles and exports a
      typed `Config` usable by `WagmiProvider`.
- [ ] 4. Create `apps/web/components/providers.tsx`: a client component
      (`"use client"`) that wraps `children` in `WagmiProvider` (using
      `lib/wagmi.ts`) and a `QueryClientProvider` (new `QueryClient` per
      mount via `useState`). Nothing else — no theme toggle, no dark mode.
      **Done when:** the component renders children unchanged when no
      provider-dependent hooks are used.
- [ ] 5. Wrap `{children}` in `<Providers>` inside `app/layout.tsx`. **Done
      when:** `pnpm --filter web build` and `pnpm --filter web lint` both
      pass with no errors.

### Files / areas

- `apps/web/app/globals.css` (edit — token swap only)
- `apps/web/app/layout.tsx` (edit — add viewport export, wrap children)
- `apps/web/lib/wagmi.ts` (new)
- `apps/web/components/providers.tsx` (new)

### Data / contracts

None — no new API or contract surface. `lib/wagmi.ts`'s `Config` type is the
only shape a later feature (wallet connect button, hire flow) will import;
flagged as load-bearing for that reason.

### Testing

No `test` script exists for `apps/web` (only `lint`/`build` per
`package.json`) — the gate here is `pnpm --filter web build` and
`pnpm --filter web lint` passing, plus a manual check that the app still
renders at `/` with no console errors (no visible UI change expected from
this feature).

### Notes for the AI

- Do not touch `--surface-*`, `--text-*`, `--interactive-*`, or any other 4a
  token outside the blocked/error swap in step 1.
- Do not add a wallet-connect button or any UI — this feature is plumbing
  only.
- Scope update: the product is no longer mobile-web-only — see
  `context/frontend-roadmap.md` §1–2 and §9 (updated) for the responsive
  direction (single-column below `md`, reflowed wider layout at `md`+, no
  device-frame trick). This feature's own build steps are unaffected (no
  max-width/mobile-lock wrapper exists in `layout.tsx` or `globals.css`
  today), but do not add one — leave width/layout unconstrained here and let
  4b+ component/screen work implement the actual breakpoints.
- `CHAIN_ID=31337` and `BASE_RPC_URL` come from `.env.example`; read them via
  `process.env.NEXT_PUBLIC_*` if the RPC URL needs to reach the browser client
  (needs a `NEXT_PUBLIC_` prefix to be exposed — check whether one exists in
  `.env.example` before assuming; if not, add `NEXT_PUBLIC_BASE_RPC_URL` and
  flag it in the diff for the user to confirm before relying on it in prod).

---

## Remaining sub-features

- [x] 4a. Tokens & theme foundation — Completed
- [ ] 4b. Core components — Avatar, Badge, Button, IconButton
- [ ] 4c. Forms components — Checkbox, Input, Radio, SearchInput, Select, Slider, Switch
- [ ] 4d. Feedback components — Banner, EmptyState, ProgressBar, Toast, Tooltip
- [ ] 4e. Navigation components — FilterChips, NavItem, Stepper, Tabs
- [ ] 4f. Overlay components — Dialog, Menu
- [ ] 4g. Data & Trust components — Card, ListRow, StatCard, Table, TrustIndicator

Each later sub-feature implements its components with HeadlessUI where a
primitive exists, skinned to the tokens from 4a, matching the prop contracts
recorded in the design system's `_adherence.oxlintrc.json` (e.g. `Button`
variant ∈ `primary|secondary|ghost|danger`, `Badge`/`Toast`/`Banner`/`ListRow`
status ∈ `approved|pending|blocked|error(|neutral)`, `TrustIndicator` level ∈
`new|building|established`). HeadlessUI has no primitive for **Slider** (use a
native `<input type="range">`) or **Tooltip** (build on `Popover` + `Transition`)
— carry that into 4c/4d. Pass the sub-feature letter (e.g. `4b`) back into
`/feature` when ready for the next one.

---

## History

- **Coolify Docker Compose deployment** — production Dockerfiles for api/web plus a docker-compose.prod.yml so the whole stack deploys as one Coolify resource (Completed)
- **Minimal Prisma schema + GET /health endpoint for apps/api** — fix: unblocks the paused Coolify deployment feature, which needs something real to migrate and health-check inside the api container (Completed)
- **Fix apps/api Dockerfile build order: prisma generate before nest build** — fix: the actual Coolify deployment failed because nest build ran before prisma generate, invisible in local testing due to stale local generated files (Completed)
- **Strip create-next-app / Nest CLI boilerplate from apps/web and apps/api** — fix: remove stock scaffold content (default page, logos, Hello World controller, framework READMEs) so the project reads as real app code (Completed)
- **Full Prisma database schema for apps/api** — the complete, final Postgres schema (wallets, agents, policies, activity, approvals, intents, tokens, prices, indexer cursor, demo tooling) so the schema is never touched again during the hackathon (Completed)
- **Design system tokens & theme foundation (4a)** — port the Handler Design System's tokens into apps/web ahead of implementing its 27 components with HeadlessUI across sub-features 4b–4g (Completed)
- **Root layout: providers + viewport + block-color correction** — finish app/layout.tsx (wagmi + TanStack Query provider tree, viewport meta) and fix a blocked-status color conflict between 4a's token port and the roadmap's design direction (Current)
