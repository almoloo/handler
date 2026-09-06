# Current Feature

Nothing in progress. Run `/feature`, `/fix`, or `/rollback` to start the next
one.

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
- **Root layout: providers + viewport + block-color correction** — finish app/layout.tsx (wagmi + TanStack Query provider tree, viewport meta) and fix a blocked-status color conflict between 4a's token port and the roadmap's design direction (Completed)
