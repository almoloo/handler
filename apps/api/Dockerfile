# Build context is the repo root (pnpm workspace), not this directory.
# docker build -f apps/api/Dockerfile .

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
# Must run before `nest build` — src/prisma/prisma.service.ts imports the
# generated client, so tsc fails on a fresh checkout without it.
# prisma.config.ts also requires DATABASE_URL to be resolvable just to load
# the config, even though `generate` never connects to a database — a
# placeholder is enough here; the real value is supplied at container
# runtime for `migrate deploy`.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    pnpm --filter api exec prisma generate
RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod /app/deploy

FROM node:22-slim AS runtime
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/deploy ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
