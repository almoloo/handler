# Build context is the repo root (pnpm workspace), not this directory.
# docker build -f apps/web/Dockerfile .

FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# @handler/contracts must ship compiled JS, not raw ts/generated.ts — see
# apps/api/Dockerfile for why (Node's native TS type-stripping refuses to
# run on files under node_modules).
RUN pnpm --filter @handler/contracts build:ts
# Next.js inlines NEXT_PUBLIC_* vars into the client bundle at build time —
# setting it only as a runtime container env var (docker-compose.prod.yml)
# has no effect, so it must be threaded in here as a build arg.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Inlined into the client bundle at build time, so it must be present here and
# not only at run time. The DEMO_TOKEN is deliberately not a build arg — the
# operator pastes it into the screen so it never reaches the bundle.
ARG NEXT_PUBLIC_DEMO_ENABLED
ENV NEXT_PUBLIC_DEMO_ENABLED=$NEXT_PUBLIC_DEMO_ENABLED
RUN pnpm --filter web build

# Next's standalone output traces from the pnpm workspace root, so it
# mirrors the monorepo path: apps/web/.next/standalone/apps/web/server.js
# (not a flat server.js).
FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone/ ./
COPY --from=build /app/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=build /app/apps/web/public/ ./apps/web/public/
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container ID by default; Next's standalone
# server binds to $HOSTNAME if set, which then resolves to the container's
# own bridge IP instead of all interfaces — breaking loopback access (e.g.
# a healthcheck run from inside the same container). Force it to bind wide.
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
