# Current Feature

Nothing in progress. Run `/feature`, `/fix`, or `/rollback` to start the next
one.

---

## Remaining sub-features

- None yet.

---

## History

- **Coolify Docker Compose deployment** — production Dockerfiles for api/web plus a docker-compose.prod.yml so the whole stack deploys as one Coolify resource (Completed)
- **Minimal Prisma schema + GET /health endpoint for apps/api** — fix: unblocks the paused Coolify deployment feature, which needs something real to migrate and health-check inside the api container (Completed)
- **Fix apps/api Dockerfile build order: prisma generate before nest build** — fix: the actual Coolify deployment failed because nest build ran before prisma generate, invisible in local testing due to stale local generated files (Completed)
- **Strip create-next-app / Nest CLI boilerplate from apps/web and apps/api** — fix: remove stock scaffold content (default page, logos, Hello World controller, framework READMEs) so the project reads as real app code (Completed)
- **Full Prisma database schema for apps/api** — the complete, final Postgres schema (wallets, agents, policies, activity, approvals, intents, tokens, prices, indexer cursor, demo tooling) so the schema is never touched again during the hackathon (Completed)
