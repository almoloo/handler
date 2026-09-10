# Handler contracts

The on-chain half of Handler — "the banking app for your AI." A guarded wallet
that lets a person hire an AI agent, give it an on-chain spending policy
(daily/per-tx USD caps, a co-sign threshold, a minimum counterparty ERC-8004
trust tier), and have those rules enforced on-chain. Four contracts:
`HandlerWallet` (the policy engine), `TrustReader` (real ERC-8004 Identity +
Reputation registry reads, no override path), `PriceConverter` (real Chainlink
`AggregatorV3` reads, no override path), and `HandlerWalletFactory` (one
`HandlerWallet` per owner via CREATE2). Full architecture, check order, and
day-by-day plan: `context/contracts-roadmap.md`.

Built with [Foundry](https://book.getfoundry.sh/) (forge/anvil/cast).

## Commands

```shell
forge build                          # compile
forge test                           # run the unit/fuzz/invariant suite
forge test --match-test <testName>   # a single test
forge fmt                            # format
anvil --fork-url $BASE_RPC_URL       # local chain, forking Base mainnet (or `pnpm dev:chain` from the repo root)
```

Deploy scripts (both share `script/DeployConfig.sol`'s real registry/feed
addresses):

```shell
# Local/dev — anvil only, deploys PriceConverter/TrustReader/HandlerWallet/Factory fresh
forge script script/DeployDev.s.sol --rpc-url <anvil-rpc> --private-key <funded local account> --broadcast

# The real public deployment — Base mainnet only
forge script script/DeployBase.s.sol --rpc-url <base-mainnet-rpc> --private-key <funded deployer key> --broadcast
```

`script/DemoReplay.s.sol` is the contracts lane's own integration smoke test —
see its header comment for full usage. It replays all three demo beats
(pay a Verified counterparty, get blocked paying an unregistered one, pay
above the co-sign threshold and approve it) end-to-end against a real local
`HandlerWallet`, registering its own throwaway ERC-8004 counterparty rather
than depending on any production secret.

## Security notes

Honest scope statement, since judges should be able to read a wallet
contract's attack surface up front rather than discover it themselves:

- **Single-owner wallet, no upgradeability.** Each `HandlerWallet` is owned by
  exactly one address (`Ownable2Step`) with no proxy, no delegatecall, and no
  admin/upgrade path anywhere in these contracts — a hackathon wallet that
  can't be upgraded is a deliberate tradeoff, not an oversight. No ERC-4337 /
  account abstraction either.
- **Trust tiers are read-only from the real ERC-8004 registries, with no
  override.** `TrustReader.tierOf()` resolves `VERIFIED`/`NEW`/`FLAGGED` from
  the live Identity + Reputation registries; there is no owner-settable
  fallback anywhere in the deployed contracts. `TrustReader` does keep a small
  on-chain cache (the real registry has no reverse address→agentId lookup),
  populated only by permissionless, trustless `syncAgent(agentId)` calls that
  re-read the canonical registry — never an assertion anyone can set
  arbitrarily.
- **Prices are read-only from real Chainlink feeds, with no override.**
  `PriceConverter.usdValue()` reads `AggregatorV3Interface.latestRoundData()`
  with a per-feed staleness window (`StalePrice`/`InvalidRoundTimestamp`);
  feed addresses/decimals/staleness windows are owner-configured once via
  `setFeed()`, which is configuration, not a price — there is no
  owner-settable rate anywhere in the deployed contracts.
- **Reentrancy guarded.** `execute()`, `tryExecute()`, and `approve()` — every
  function that mutates state and then makes an external call — carry
  `nonReentrant`, and all three follow checks-effects-interactions (state
  committed before the external call, not after).
- **Session-key invariant.** A hired agent's session key can never redirect
  funds to itself (`call.target == msg.sender` reverts `TargetIsSessionKey()`
  in `execute`/`tryExecute`/`propose`) and has no reachable path to
  `updatePolicy` — that function is `onlyOwner`, full stop. An agent can spend
  within the policy it was given; it can never change that policy or
  self-withdraw.
- **The showcase counterparties are really registered.** The agents used in
  the demo video earn their `VERIFIED`/`NEW` tiers the same way any real
  counterparty would: registered on-chain, with real feedback entries, by a
  disclosed one-time setup script (`apps/api/scripts/register-agents.ts`).
  Handler's own contracts never write reputation.

### Known limitations

- **`TrustReader`'s sync cache can go stale.** If a registered agent's
  underlying registry wallet later changes, `tierOf()` keeps returning the
  cached tier until someone calls `syncAgent()` again for that agent id — the
  same class of staleness the backend's own trust cache already documents for
  an unreachable registry.
- **Static analysis: one default Slither pass run, 22 findings, all triaged.**
  Every finding was either a false positive (enum-equality reads as
  "dangerous strict equality"; Slither's timestamp detector lists every
  comparison in a function once any part of it touches `block.timestamp`,
  including unrelated ones; default-zero-initialized locals read as
  "uninitialized"; a compiled bytecode blob read as a "many digits" literal)
  or an accepted, necessary pattern for this contract's job (the inline
  assembly + low-level `.call` in `_commitAndCall`/`approve` that forwards
  ETH and bubbles up a counterparty's real revert reason; the genuine
  timestamp comparisons in `_rollEpoch`'s 24h epoch roll and
  `PriceConverter`'s staleness window, both deliberate and tested; the mixed
  `^0.8.20`/`^0.8.26` pragma floors across OpenZeppelin vs. Handler's own
  contracts, which still compile under one single solc run). No finding
  required a code change on its own.
- **One real bug found while triaging, not by Slither itself, and fixed:**
  `TrustReader._averageFeedback()` computed `10 ** (18 - valueDecimals[i])`
  directly — since the real ERC-8004 Reputation Registry lets any caller set
  `valueDecimals` per feedback entry via the permissionless `giveFeedback()`,
  a single entry with `valueDecimals > 18` underflowed that subtraction and
  reverted, uncaught, all the way out through `tierOf()` into
  `tryExecute()` — a permissionless way to break the "blocked ≠ revert"
  guarantee for any counterparty. `apps/api/src/trust/trust.service.ts`'s
  TypeScript mirror of this exact function already excluded malformed
  entries instead of aborting; `TrustReader.sol` itself never got the
  equivalent guard until now. Fixed in source, with three new tests proving
  it (`test_MalformedValueDecimalsEntry_ExcludedNotReverted_StillVerified`,
  `test_AllFeedbackMalformed_ResolvesToNew_NotReverted`,
  `test_ValueDecimalsExactly18_IsIncludedNotSkipped` for the boundary) — all
  confirmed to fail with the exact predicted underflow panic (or the
  off-by-one equivalent) against the pre-fix code before the fix was
  applied. **This fix has not yet reached the live Base-mainnet deployment**
  (`TrustReader`/`HandlerWalletFactory` are both `immutable`-wired, so a
  source change alone doesn't patch already-deployed bytecode): the
  vulnerability remains exploitable against the real, already-registered
  showcase Subcontractor until `TrustReader` and `HandlerWalletFactory` are
  redeployed via `script/DeployBase.s.sol`, `apps/api/scripts/register-agents.ts`
  is re-run, and `ts/addresses.ts`'s `8453` entries are updated to match —
  an operator action with a funded mainnet key, not something this repo can
  do on its own.
