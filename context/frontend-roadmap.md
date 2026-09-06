# Handler — Frontend Roadmap (End-to-End)

**Event:** ETHOnline 2026 (Sept 4–16, async) · **Submission:** Sun Sept 13, 12:00 pm EDT
**Positioning:** The banking app for your AI — hire agents like employees, give them a card with rules, get a buzz when something's off.
**Primary deliverable:** a mobile-web app whose screens carry the 3-minute demo video. Every frontend decision is judged by one question: *does this make the video better?*

---

## 1. Stack & Project Setup

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Home turf; fastest path to polish |
| Styling | Tailwind CSS + CSS variables for tokens | Speed + a real token system |
| Components | Headless (HeadlessUI primitives) + custom skin | No template look; full design control; native Tailwind integration |
| Animation | Framer Motion | Notification cards + approval moments need choreography |
| Wallet | wagmi + viem | Wallet connection + **owner-signed txs** (hire, freeze, approve, deny) |
| Ledger | Ledger DMK / device-signing kit via wagmi connector | The owner wallet — co-sign flow (partner track #1) |
| Data | TanStack Query against **backend REST + SSE** (see backend roadmap) | Backend indexes & decodes chain once; no client log-polling |
| State | Zustand (one store: agents, policies, activity, demo script) | Light, predictable, easy to drive demo mode |
| Charts | None | Cut — numbers and badges tell the story faster |
| Deploy | Vercel, mobile-web only | Phone is the co-star of the video |

Repo conventions: `/app` routes, `/components/ui` (skinned primitives), `/components/domain` (AgentCard, TrustBadge, ActivityItem, ApprovalSheet), `/lib/contracts` (typed ABIs via wagmi codegen), `/lib/demo` (scripted demo engine — first-class code, not an afterthought).

---

## 2. Design Direction (proposal — Ali overrides freely)

**Concept: "the dossier."** Handler is a spy-craft name; the interface borrows the calm authority of an intelligence briefing crossed with a modern banking app. Employees (agents) have files, clearance levels, and allowances. The product should feel *in control* — quiet surfaces, one loud moment (the red block).

**Tokens (starting point):**
- **Color:** `--paper #F7F6F2` (light base — banking apps are light; dark mode is a cut), `--ink #1C2321` (deep green-black text), `--field #2E4B3F` (primary — banker's green, trust without crypto-neon), `--signal-approve #2E7D4F`, `--signal-block #C6392F` (the villain color; reserved exclusively for blocks/freezes so it lands hard on video), `--badge-gold #B08D2E` (verified trust tier).
- **Type:** one family, two voices — a grotesque with personality (e.g., *Söhne*, *General Sans*, or *Inter Tight* as fallback) with tight display sizes for balances and generous 15–16px body. Numbers always tabular-lining. No all-caps labels, no eyebrow labels.
- **Layout:** single-column mobile (max-w ~430px centered on desktop with a device-frame border so even a laptop viewing reads as a phone). Left-aligned. Structure via spacing and weight, not card-borders-on-everything; the *notification cards* are the only heavily-carded element, which makes them the signature.
- **Motion budget:** exactly two orchestrated moments — (1) a notification card sliding in with a soft haptic-style bounce, (2) the block moment: red card + brief screen-edge pulse. Everything else is instant or answers a tap.

**Signature element:** the notification card. It is the product's voice ("🟢 Approved: swap $40 USDC→ETH", "🔴 Blocked: unverified agent requested $500"). Spend the design boldness there; keep everything else disciplined.

**Copy rules:** plain fintech English, sentence case, active voice. "Give allowance", "Freeze agent", "Approve payment". Never expose jargon on-screen: no "ERC-8004", no "session key", no hex addresses (truncate + name everything). The word *reputation* in code becomes *trust* in the UI.

---

## 3. Information Architecture & Routes

```
/            → Payroll (home): agents-as-employees list
/hire        → Onboarding: 3-step "employ your agent" flow
/agent/[id]  → Agent file: policy, trust badge, activity, freeze
/activity    → Full activity feed (approved / blocked / pending)
/approve/[tx]→ Approval sheet (deep-link target from notification)
/demo        → Hidden: demo director controls (never linked in nav)
```

Navigation: two-tab bottom bar (Payroll · Activity) + a floating "Hire agent" action. No settings screen — cut.

---

## 4. Screens (build order = demo importance)

### 4.1 Payroll (home) — *the beauty shot*
- Header: total under management + "protected by Handler" line.
- Agent rows: avatar, name, trust badge, spent-today vs. allowance as a slim progress bar, status dot (active / frozen / pending approval).
- Swipe or long-press → Freeze (instant, red confirmation).
- Empty state: "No agents on payroll yet. Hire your first." → /hire. (Empty states get real copy — the showcase screenshots may include them.)

### 4.2 Hire flow (onboarding) — *the "15 seconds to safety" demo beat*
1. **Pick agent** — list with trust badges pre-fetched from the ERC-8004 read layer (seeded data); scanning a "new" agent shows the tighter default policy it will get.
2. **Set allowance** — the slider ($/day) with live USD framing ("Riley can spend up to $50/day"). Per-tx cap auto-derived, editable via one "advanced" disclosure.
3. **Set permissions** — three toggles max: Swaps ✓ · Unknown contracts ✗ · Pay other agents: *verified only* (default). Confirm → contract call → success screen with confetti-free restraint (a single check-draw animation).

### 4.3 Agent file (/agent/[id])
- Trust badge with plain-English explanation ("Verified — 214 attested jobs" / "New — no track record yet: tighter limits apply").
- Policy summary as sentences, not a table: "Riley can spend $50/day, swap tokens, and pay verified agents. Payments over $25 need your approval."
- Activity list scoped to this agent; Freeze button.

### 4.4 Approval sheet (/approve/[tx]) — *the co-sign moment*
- Full-screen sheet: who's asking, how much, their trust badge, what the money is for (calldata decoded to a sentence).
- **Deny** = one tap. **Approve** = routes through the Ledger signing flow (clear-signing surfaced: show what the device shows). This screen is partner-track evidence for Ledger — screenshot-ready.

### 4.5 Activity feed
- Chronological cards, filter chips: All / Blocked / Pending. Blocked items keep their red left edge permanently — the feed becomes a visible security record.

### 4.6 Notifications layer (cross-screen)
- In-app toast-cards (top slide-in) driven by the activity poller; tapping a pending card deep-links to /approve/[tx].
- Real push is out of scope — in-app cards on a phone screen read identically on video.

---

## 5. Data & Contract Integration

- **Reads:** all feed/list data (agents, activity, pending approvals, trust tiers, prices) comes from the **backend REST + SSE** — the backend indexes and decodes chain events once (see backend roadmap §4.1). The only direct chain reads client-side are the connected owner wallet's balance/network via wagmi.
- **Writes (all owner-signed, client-side via wagmi — the backend never holds the owner key):** create wallet (factory), hire agent, update allowance, freeze, approve pending tx (Ledger path), deny. After a write lands, the backend indexer picks it up within one tick; optional `POST /approvals/:id/approved|denied` callbacks give the UI instant feedback ahead of indexing.
- **Trust layer:** trust tiers arrive pre-computed from the backend (`GET /agents`); the frontend renders badges only. The seeded-fixture logic lives server-side (backend roadmap §4.3), not in the client.
- **Prices:** USD framing on caps ("$50/day ≈ 0.011 ETH today") from backend `GET /prices` (Chainlink-fed, cached) — one price source across UI, backend, and what the contracts enforce.
- **1inch:** the agent's swaps are backend/script-side, but the frontend renders the swap receipts in activity with route metadata ("via 1inch") — visible integration again.

---

## 6. Demo Engine (treat as a feature, not a hack)

`/demo` director screen (phone #2 or laptop) with buttons that trigger the scripted beats:
1. **"Start workday"** — good agent begins rebalancing (real testnet txs, pre-funded).
2. **"Hire subcontractor"** — good agent pays a verified agent (machine-to-machine beat).
3. **"Send the villain"** — zero-reputation agent attempts the $500 charge → wallet's `tryExecute()` blocks it and emits `ExecutionBlocked` on-chain (a real, explorer-visible tx — see contracts roadmap §2.1) → red card on the hero phone.
4. **"Retry over threshold"** — verified agent requests above co-sign cap → pending card → approval sheet → Ledger.
Plus **Reset** — restores balances/state for retakes (video will need 5+ takes; one tap, < 30s). Beats 1–4 map to backend `POST /demo/beat/:n`; Reset maps to `POST /demo/reset`.

Rule: every beat produces a *real* on-chain transaction. The script controls timing, never fakes results.

---

## 7. Day-by-Day (frontend lane, aligned to locked scope)

| Day | Frontend goal | Exit criterion |
|---|---|---|
| 1 | Scaffold, tokens, wagmi config, UI primitives skinned | App shell deployed to Vercel |
| 2 | Payroll screen with mock store; TrustBadge + ActivityItem components | Home looks screenshot-worthy on mock data |
| 3 | Hire flow against the contracts lane's **dev deployment** (direct `hireAgent` on the pre-created dev wallet; factory/CREATE2 arrives day 5) | Can employ an agent for real |
| 4 | Activity feed + notification cards on **backend REST + SSE** (mocks off) | Live txs appear as cards unaided |
| 5 | Agent file + freeze + policy sentences; USD framing via `GET /prices`; switch hire flow to the factory | Policy round-trips on-chain |
| 6 | Approval sheet + Ledger co-sign path | Full pending→approve/deny loop works |
| 7 | Demo engine + villain beat + reset; **feature freeze at EOD** | Beats 1–4 + reset run back-to-back clean |
| 8 | Polish pass: motion budget, copy pass, empty/error states, device-frame, seed data | Zero known visual bugs on iPhone-width |
| 9 | Video day: script, record on the real app, edit, submit **early** | Submitted before the deadline rush |

Shared risk rule: any day-4+ slip eats polish, never the demo engine. If forced to cut, cut in this order: activity filters → agent file niceties → advanced allowance disclosure. Never cut: notification cards, hire flow, approval sheet, reset button.

---

## 8. Quality Floor & Video-Readiness Checklist

- [ ] Every screen tested at 390×844 (iPhone) — the recording resolution
- [ ] No hex addresses, no jargon, no dev artifacts visible anywhere on the demo path
- [ ] Red reserved exclusively for block/freeze; first red in the video is the villain beat
- [ ] Loading states never appear during demo beats (pre-warm + optimistic UI on approve/deny)
- [ ] Reset → full clean state in one tap, < 30 seconds
- [ ] Screenshots exported for the showcase page: Payroll, Hire step 2, red block card, approval sheet (Ledger)
- [ ] Reduced-motion respected; focus states visible (judges sometimes open the live app — it should survive a keyboard)
- [ ] Live deployment link works logged-out with a "Try the demo" seeded mode

---

## 9. Explicitly Out of Frontend Scope

Desktop layout · dark mode · real push notifications · settings · multi-wallet · charts · i18n · x402 UI (roadmap slide only) · advanced policy builder (slider + 3 toggles is the builder).
