# Current Feature

Nothing in progress. Run `/feature`, `/fix`, or `/rollback` to start the next
one.

---

## Remaining sub-features

- [x] 4a. Tokens & theme foundation — Completed
- [x] 4b. Core components — Avatar, Badge, Button, IconButton — Completed
- [x] 4c. Forms components — Checkbox, Input, Radio, SearchInput, Select, Slider, Switch — Completed
- [x] 4d. Feedback components — Banner, EmptyState, ProgressBar, Toast, Tooltip — Completed
- [x] 4e. Navigation components — FilterChips, NavItem, Stepper, Tabs — Completed
- [x] 4f. Overlay components — Dialog, Menu — Completed
- [x] 4g. Data & Trust components — Card, ListRow, StatCard, Table, TrustIndicator — Completed

**All 7 sub-features are complete — the 4a–4g design-system rollout is done.**
Contrary to this note's original assumption, none of the 27 components
actually use HeadlessUI except `Dialog` (built on it deliberately for its
focus-trap/portal/Escape/ARIA behavior, not because the canvas used it — the
canvas didn't). All 27 components are exported from
`apps/web/components/ui/index.ts` but remain unconsumed by any screen. The
marketing landing page (see History) was the first consumer; building the
real Payroll screen at `/app` (per `frontend-roadmap.md` §7 day 2) is the
natural next `/feature`.

---

## History

- **Coolify Docker Compose deployment** — production Dockerfiles for api/web plus a docker-compose.prod.yml so the whole stack deploys as one Coolify resource (Completed)
- **Minimal Prisma schema + GET /health endpoint for apps/api** — fix: unblocks the paused Coolify deployment feature, which needs something real to migrate and health-check inside the api container (Completed)
- **Fix apps/api Dockerfile build order: prisma generate before nest build** — fix: the actual Coolify deployment failed because nest build ran before prisma generate, invisible in local testing due to stale local generated files (Completed)
- **Strip create-next-app / Nest CLI boilerplate from apps/web and apps/api** — fix: remove stock scaffold content (default page, logos, Hello World controller, framework READMEs) so the project reads as real app code (Completed)
- **Full Prisma database schema for apps/api** — the complete, final Postgres schema (wallets, agents, policies, activity, approvals, intents, tokens, prices, indexer cursor, demo tooling) so the schema is never touched again during the hackathon (Completed)
- **Design system tokens & theme foundation (4a)** — port the Handler Design System's tokens into apps/web ahead of implementing its 27 components with HeadlessUI across sub-features 4b–4g (Completed)
- **Root layout: providers + viewport + block-color correction** — finish app/layout.tsx (wagmi + TanStack Query provider tree, viewport meta) and fix a blocked-status color conflict between 4a's token port and the roadmap's design direction (Completed)
- **4b. Core components — Avatar, Badge, Button, IconButton** — port these four primitives from the Handler Design System canvas into components/ui/, reverting the prior feature's block-color swap to match the canvas's actual (and deliberate) slate-blocked/red-error semantics (Completed)
- **4c. Forms components — Checkbox, Input, Radio, SearchInput, Select, Slider, Switch** — port these 7 primitives from the canvas into components/ui/, using the canvas's native-control implementations rather than HeadlessUI; also fixed a Tailwind arbitrary-value bug (`text-[var(--text-*)]` silently resolving to `color` instead of `font-size`) found during audit, across this feature's 7 files and the already-merged 4b's Badge/Button (Completed)
- **4d. Feedback components — Banner, EmptyState, ProgressBar, Toast, Tooltip** — port these 5 primitives from the canvas into components/ui/, using the canvas's plain Tooltip implementation rather than HeadlessUI, applying the text-[length:...] fix from the start; audit also caught and fixed missing `type="button"` on Banner/Toast's dismiss buttons (Completed)
- **4e. Navigation components — FilterChips, NavItem, Stepper, Tabs** — port these 4 primitives from the canvas into components/ui/, fixing a hardcoded #fff in Stepper to var(--gray-0) and applying type="button" proactively; caught and fixed a border-none/border-b-2 conflict in Tabs during implementation (Completed)
- **4f. Overlay components — Dialog, Menu** — port Menu as a straight canvas port; build Dialog on @headlessui/react's real Dialog primitive instead (focus trap, portal, Escape, ARIA) since it's the Ledger co-sign confirmation screen, not a cosmetic primitive; audit verified the HeadlessUI claims directly against its shipped source (Completed)
- **4g. Data & Trust components — Card, ListRow, StatCard, Table, TrustIndicator** — port the final 5 primitives from the canvas into components/ui/, generalizing a Tailwind default-value collision rule (rounded-*/tracking-* etc. must use [var(--x)], never the bare utility) found via Table's tracking-wider; completes the 4a–4g design-system rollout. Note: Table's div-based markup (matching the canvas) lacks semantic `<table>` structure — same inherited, deferred-to-day-8 gap class as Menu/NavItem/Tooltip, despite this feature having no clickable elements otherwise (Completed)
- **Marketing landing page at `/`** — build the public marketing homepage from the imported `Handler Landing Page.dc.html` canvas, re-skinned onto the current design-system tokens; moves the future in-app Payroll screen from `/` to `/app` per confirmed scope decision (Completed)
