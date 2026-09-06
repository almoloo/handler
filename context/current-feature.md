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
