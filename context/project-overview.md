# Handler — guarded AI agent wallets

> **Note:** This document is a high-level overview of the Handler project. It is intended to provide context and guidance for developers (and AI assistants) working on the project, but it is not a comprehensive technical specification. For detailed implementation instructions, refer to the coding standards, AI interaction guidelines, and other context documents.

---

## Problem Statement

Agentic commerce is growing fast: people and businesses are handing AI agents real spending power (swaps, subscriptions, agent-to-agent payments) with almost no guardrails beyond static spending caps. Existing agent wallets (MetaMask Agent Wallet, Coinbase Agentic Wallets) enforce fixed limits that don't know anything about *who* the agent is paying. Handler is a consumer app — "the banking app for your AI" — that lets a person hire an agent, give it an allowance and rules, and have those rules enforced on-chain, including rules that adapt to the counterparty's on-chain reputation.

Built for **ETHGlobal ETHOnline 2026** (Sept 4–16, async). Primary partner-track target: **Ledger** (AI Agents x Ledger — device-backed session-key custody plus human-in-the-loop co-sign). Stretch target: **Chainlink**'s Confidential Workflow track. 1inch swaps remain a real product feature (Riley's rebalancing) but are no longer a targeted prize track — ETHOnline 2026's 1inch track requires building on their Aqua/SwapVM contracts, which this project doesn't use. See each part's roadmap for the concrete per-track plan.

---

## Objectives

1. **Guarded spend** — every agent gets an on-chain policy: daily/per-tx USD caps, a contract/merchant allowlist, and a co-sign threshold above which a human must approve.
2. **Trust-aware policy** — spending rules that tighten or loosen based on the counterparty agent's ERC-8004 reputation (verified / new / flagged), not just static numbers.
3. **Real economic action** — the agent actually does things (token swaps via 1inch, paying other agents), not a mock demo.
4. **Consumer-grade UX** — fintech-simple screens (payroll view, notification cards, one-tap approve/deny), not a raw dashboard.
5. **Provable, production-real** — every "blocked" moment is a real, explorer-visible on-chain event. The demo video is a scripted run of the *real product* with real wallets, real agents, and real registries; nothing in the codebase exists only to make the video look good.

---

## Features (locked scope for the hackathon)

### Guarded Wallet
- Owner hires an agent by giving it a session key + policy (allowance, allowlist, co-sign threshold, minimum counterparty trust tier).
- Agent executes through the wallet; blocked attempts emit an on-chain event rather than silently reverting, so they're indexable and demo-able.
- Payments above the co-sign threshold go into a pending queue the owner approves or denies (Ledger-signed).
- Owner can freeze an agent instantly.

### Trust Layer
- Counterparty agents are scored via ERC-8004 Identity + Reputation registries into three tiers: Verified, New, Flagged. Unregistered addresses are Flagged.
- Tiers come **only** from the registries — no seeded fixtures, no owner-settable override, no env flag that swaps in fake data. The showcase counterparties used in the video are real ERC-8004-registered agents (registered on-chain by a disclosed one-time setup script), so the demo reads the same code path as any user's wallet.

### Consumer App
- Sign-in via SIWE (Sign-In with Ethereum): owner signs a nonce with their connected wallet to establish a real, session-backed login — no separate password/account system. Every `/app` read and write is scoped to the signed-in wallet; any wallet can sign in, create a Handler wallet, and hire agents.
- Payroll home screen: agents listed like employees, spent-today vs. allowance, one-tap freeze.
- Hire flow: pick an agent, set an allowance slider, set three permission toggles — no seed phrases, no jargon on screen.
- Notification cards: plain-English approved/blocked/pending events.
- Approval sheet: decoded plain-English intent, one-tap deny, Ledger-signed approve.

### Product integrity (non-negotiable)

Handler is built as a working product that happens to be demoed, not a demo that happens to look like a product:

- **Any wallet works.** There is no single hard-coded "demo wallet" that the app is built around. A fresh visitor connects their own wallet, signs in, creates a wallet through the factory, and hires an agent — the same path the video records.
- **No dummy data in runtime code.** No mock stores, seeded fixtures, hardcoded prices, or trust overrides anywhere in `apps/web`, `apps/api`, or `packages/contracts` runtime paths. Test doubles live in test files only.
- **Real integrations or nothing.** Prices come from Chainlink feeds with staleness checks; trust from ERC-8004 registries; swaps from 1inch. If an integration isn't ready, the feature is visibly incomplete — never silently stubbed.
- **Reads and writes are both authenticated** and scoped to the session's wallet address. Only `/health`, `/prices`, `/auth/*`, and the marketing page are public.
- **Tests are part of the deliverable**, not a nice-to-have: contracts have unit/fuzz/invariant coverage, the API has unit + e2e coverage for every endpoint (including auth scoping), and the web app builds clean with typed API clients.
- **Demo tooling is isolated and non-destructive.** The `/demo` director exists only to trigger real agent actions against one designated showcase wallet. It is disabled unless `DEMO_ENABLED=true`, gated by session auth *and* a header token, and never deletes or rewrites another wallet's data.

### Out of scope (explicitly, for the hackathon window)
Multi-chain, mobile-native app, full x402 integration, ERC-4337/account abstraction, on-chain reputation *writing*, dark mode.

---

## Technology Stack

- **Web (`apps/web`)**: Next.js (App Router) + TypeScript, Tailwind, wagmi + viem, Framer Motion, Ledger Device Management Kit for co-signing — the human-in-the-loop half of the Ledger track (owner approves a high-risk action on-device).
- **API (`apps/api`)**: NestJS + TypeScript, Prisma + PostgreSQL, viem for chain reads, SSE for realtime activity, cron-based indexer (no queue infra), SIWE-based session authentication guarding all write endpoints. Riley's session key and the 1inch API key are stored as **Ledger Key Ring** ciphertext (`wallet-cli ring`, keys derived from the Ledger seed) and decrypted into the process env on the enrolled host at boot — never plaintext in deploy config. That's the secret-custody half of the Ledger track ("agents that use secrets they cannot leak"); the VPS enrollment itself is their "hosts with no USB port" priority area.
- **Contracts (`packages/contracts`)**: Solidity via Foundry, OpenZeppelin, Chainlink AggregatorV3 feeds, ERC-8004 registry reads. Deployed on Base Sepolia (or a persistent Base-mainnet anvil fork if 1inch requires it).
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`), shared contract ABIs/types generated via `@wagmi/cli`'s Foundry plugin into `packages/contracts/ts`, consumed by both apps as `@handler/contracts`.

Full architectural detail lives in `context/frontend-roadmap.md`, `context/backend-roadmap.md`, and `context/contracts-roadmap.md` — these are the authoritative, part-specific build plans (stack choices, module/screen breakdown, day-by-day sequencing, explicit out-of-scope lists). Consult the matching roadmap before planning or implementing any change in that part; treat conflicts between a roadmap and this overview as a signal to flag, not silently resolve.
