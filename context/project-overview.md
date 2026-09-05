# Handler — guarded AI agent wallets

> **Note:** This document is a high-level overview of the Handler project. It is intended to provide context and guidance for developers (and AI assistants) working on the project, but it is not a comprehensive technical specification. For detailed implementation instructions, refer to the coding standards, AI interaction guidelines, and other context documents.

---

## Problem Statement

Agentic commerce is growing fast: people and businesses are handing AI agents real spending power (swaps, subscriptions, agent-to-agent payments) with almost no guardrails beyond static spending caps. Existing agent wallets (MetaMask Agent Wallet, Coinbase Agentic Wallets) enforce fixed limits that don't know anything about *who* the agent is paying. Handler is a consumer app — "the banking app for your AI" — that lets a person hire an agent, give it an allowance and rules, and have those rules enforced on-chain, including rules that adapt to the counterparty's on-chain reputation.

Built for **ETHGlobal ETHOnline 2026** (Sept 4–16, async), targeting the Ledger, Chainlink, and 1inch partner tracks.

---

## Objectives

1. **Guarded spend** — every agent gets an on-chain policy: daily/per-tx USD caps, a contract/merchant allowlist, and a co-sign threshold above which a human must approve.
2. **Trust-aware policy** — spending rules that tighten or loosen based on the counterparty agent's ERC-8004 reputation (verified / new / flagged), not just static numbers.
3. **Real economic action** — the agent actually does things (token swaps via 1inch, paying other agents), not a mock demo.
4. **Consumer-grade UX** — fintech-simple screens (payroll view, notification cards, one-tap approve/deny), not a raw dashboard.
5. **Provable, demo-first** — every "blocked" moment is a real, explorer-visible on-chain event, not a scripted illusion.

---

## Features (locked scope for the hackathon)

### Guarded Wallet
- Owner hires an agent by giving it a session key + policy (allowance, allowlist, co-sign threshold, minimum counterparty trust tier).
- Agent executes through the wallet; blocked attempts emit an on-chain event rather than silently reverting, so they're indexable and demo-able.
- Payments above the co-sign threshold go into a pending queue the owner approves or denies (Ledger-signed).
- Owner can freeze an agent instantly.

### Trust Layer
- Counterparty agents are scored via ERC-8004 Identity + Reputation registries into three tiers: Verified, New, Flagged.
- A demo/seed override exists for deterministic video takes and is disclosed openly, never hidden.

### Consumer App
- Payroll home screen: agents listed like employees, spent-today vs. allowance, one-tap freeze.
- Hire flow: pick an agent, set an allowance slider, set three permission toggles — no seed phrases, no jargon on screen.
- Notification cards: plain-English approved/blocked/pending events.
- Approval sheet: decoded plain-English intent, one-tap deny, Ledger-signed approve.

### Out of scope (explicitly, for the hackathon window)
Multi-chain, mobile-native app, full x402 integration, ERC-4337/account abstraction, on-chain reputation *writing*, desktop-first layout, dark mode.

---

## Technology Stack

- **Web (`apps/web`)**: Next.js (App Router) + TypeScript, Tailwind, wagmi + viem, Framer Motion, Ledger Device Management Kit for co-signing.
- **API (`apps/api`)**: NestJS + TypeScript, Prisma + PostgreSQL, viem for chain reads, SSE for realtime activity, cron-based indexer (no queue infra).
- **Contracts (`packages/contracts`)**: Solidity via Foundry, OpenZeppelin, Chainlink AggregatorV3 feeds, ERC-8004 registry reads. Deployed on Base Sepolia (or a persistent Base-mainnet anvil fork if 1inch requires it).
- **Monorepo**: pnpm workspaces (`apps/*`, `packages/*`), shared contract ABIs/types generated via `@wagmi/cli`'s Foundry plugin into `packages/contracts/ts`, consumed by both apps as `@handler/contracts`.

Full architectural detail lives in `context/frontend-roadmap.md`, `context/backend-roadmap.md`, and `context/contracts-roadmap.md`.
