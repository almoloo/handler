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
- **Static analysis (Slither) has not been run yet.** A single default pass is
  planned (`context/contracts-roadmap.md` §3/§5) but not yet done — this
  section will be updated with the result once it runs, rather than claiming
  a clean pass that hasn't actually happened.
