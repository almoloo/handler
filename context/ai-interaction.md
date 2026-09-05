# AI Interaction Guidelines

## Communication

- Be concise and direct.
- Explain non-obvious decisions briefly.
- Ask before large refactors or architectural changes.
- Don't add features not in the project spec or the relevant roadmap (`context/frontend-roadmap.md`, `context/backend-roadmap.md`, `context/contracts-roadmap.md`).
- Never delete files without clarification.
- If a change to one part (contracts) requires a change in another (backend indexer, frontend types), say so explicitly and confirm before touching the second part.

## Workflow

This is the common workflow for every single feature/fix, in any of the three parts:

1. **Document** - Document the feature in `context/current-feature.md`.
2. **Branch** - Create a new branch for the feature/fix.
3. **Implement** - Implement the feature/fix described in `context/current-feature.md`.
4. **Codegen (contracts changes only)** - If `packages/contracts` changed, run `pnpm codegen` and commit the regenerated `ts/generated.ts` in the same commit as the Solidity change — never leave generated types stale relative to the contracts.
5. **Test** - Verify it works:
   - `apps/web`: check in the browser; `pnpm --filter web build` to check for errors.
   - `apps/api`: `pnpm --filter api test` for unit tests; `pnpm --filter api build`.
   - `packages/contracts`: `forge test`; for anything touching a demo beat, also run the relevant `script/DemoReplay.s.sol` step.
   - Cross-part changes: run all three before considering the feature done.
6. **Iterate** - Iterate and change things if needed.
7. **Commit** - Only after the relevant build(s)/test(s) pass and everything works.
8. **Merge** - Merge to main.
9. **Delete Branch** - Delete branch after merge.
10. **Review** - Review AI-generated code periodically and on demand.
11. Mark as completed in `context/current-feature.md` and add to history.

Do NOT commit without permission and until the build and tests pass. If build or tests fail, fix the issues first.

## Branching

Create a new branch for every feature/fix. Name it **feature/[feature]** or **fix/[fix]**. If the change spans multiple parts (e.g. a contract change plus its backend indexer update), keep it on one branch rather than splitting — it's one reviewable unit. Ask to delete the branch once merged.

## Commits

- Ask before committing (don't auto-commit).
- Use conventional commit messages (`feat:`, `fix:`, `chore:`), optionally scoped to the part: `feat(contracts): add cosign threshold`, `fix(api): dedupe activity rows by txHash`, `feat(web): add trust badge to agent card`.
- Keep commits focused - one feature/fix per commit. A contracts change and its required codegen regen count as one commit, not two.
- Never put "Generated With Claude" in commit messages.

## When Stuck

- If something isn't working after 2-3 attempts, stop and explain the issue.
- Don't keep trying random fixes.
- Ask for clarification if requirements are unclear.
- For pnpm/workspace resolution issues specifically: report the exact error, what's already been tried, and your best-guess root cause before attempting further fixes — these tend to compound if patched blindly.

## Code Changes

- Make minimal changes to accomplish the task.
- Don't refactor unrelated code unless asked.
- Don't add "nice to have" features.
- Preserve existing patterns in the codebase — this includes matching whichever part's conventions from `context/coding-standards.md` apply.
- Never invent a new package name, transport, or SDK method without verifying it actually exists (check npm/the library's docs) before writing code against it — this applies especially to newer/less-common libraries like Ledger's Device Management Kit or ERC-8004 tooling.

## Code Review

Review AI-generated code periodically, especially for:

- Security (auth checks, input validation, reentrancy, the session-key-can't-self-withdraw invariant).
- Performance (unnecessary re-renders, N+1 queries, indexer running on every poll tick instead of incrementally).
- Logic errors (edge cases — epoch-boundary math, stale price feeds, double-counted activity rows).
- Patterns (matches existing codebase and the relevant roadmap?).

## Demo Integrity

- Every "blocked" or "approved" moment shown in the app or the demo video must correspond to a real on-chain transaction — never fake, mock, or hardcode a result for the sake of a smoother demo. If a real path isn't ready yet, say so rather than stubbing it silently.
- The `/demo` director and `POST /demo/reset` endpoints are hackathon-only tooling — keep them clearly separated from user-facing code paths and never wire demo-only shortcuts into production logic.
