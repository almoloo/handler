# apps/api

Handler's backend — NestJS + Prisma/Postgres + viem. See the repo root
`CLAUDE.md` and `context/backend-roadmap.md` for stack, conventions, and
build plan.

```bash
pnpm --filter api start:dev   # dev server
pnpm --filter api build       # production build
pnpm --filter api test        # unit tests
pnpm --filter api test:e2e    # e2e tests
pnpm --filter api lint        # oxlint
```
