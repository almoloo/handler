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
# Ledger Key Ring CLI — decrypts Riley's session key / the 1inch key at boot
# instead of them living as plaintext Coolify env. See
# apps/api/docker/entrypoint.sh and docs/ledger-key-ring-setup.md.
RUN npm i -g @ledgerhq/wallet-cli@2.1.0
WORKDIR /app
COPY --from=build /app/deploy ./
COPY apps/api/docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh
ENV NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
