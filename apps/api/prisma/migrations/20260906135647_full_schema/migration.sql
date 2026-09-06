/*
  Warnings:

  - The `status` column on the `DemoRun` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('HIRED', 'COUNTERPARTY', 'VILLAIN');

-- CreateEnum
CREATE TYPE "TrustTier" AS ENUM ('VERIFIED', 'NEW', 'FLAGGED');

-- CreateEnum
CREATE TYPE "TrustSource" AS ENUM ('CHAIN', 'FIXTURE', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('WALLET_CREATED', 'HIRED', 'POLICY_UPDATED', 'FROZEN', 'UNFROZEN', 'SWAP', 'AGENT_PAYMENT', 'TRANSFER', 'CONTRACT_CALL', 'BLOCKED', 'PENDING', 'APPROVED', 'DENIED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionKind" AS ENUM ('SWAP', 'AGENT_PAYMENT', 'TRANSFER', 'CONTRACT_CALL');

-- CreateEnum
CREATE TYPE "BlockReason" AS ENUM ('AGENT_FROZEN', 'UNKNOWN_CONTRACT', 'SWAPS_NOT_ALLOWED', 'COUNTERPARTY_BELOW_TIER', 'EXCEEDS_PER_TX_CAP', 'EXCEEDS_DAILY_ALLOWANCE', 'REQUIRES_COSIGN', 'STALE_PRICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('CHAIN', 'RUNTIME');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ResolutionSource" AS ENUM ('CHAIN', 'CALLBACK');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('PLANNED', 'SUBMITTED', 'CONFIRMED', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "DemoRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "DemoRun" ADD COLUMN     "error" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "DemoRunStatus" NOT NULL DEFAULT 'RUNNING',
ALTER COLUMN "log" SET DEFAULT '[]';

-- CreateTable
CREATE TABLE "Wallet" (
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "owner" VARCHAR(42) NOT NULL,
    "createdTxHash" VARCHAR(66),
    "createdBlock" BIGINT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "avatar" TEXT,
    "kind" "AgentKind" NOT NULL,
    "erc8004AgentId" BIGINT,
    "trustTier" "TrustTier" NOT NULL DEFAULT 'FLAGGED',
    "trustSource" "TrustSource" NOT NULL DEFAULT 'FIXTURE',
    "trustSummary" TEXT NOT NULL DEFAULT '',
    "trustDetail" JSONB NOT NULL DEFAULT '{}',
    "attestationCount" INTEGER NOT NULL DEFAULT 0,
    "trustCheckedAt" TIMESTAMP(3),
    "isSeeded" BOOLEAN NOT NULL DEFAULT false,
    "keyEnvVar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionKey" VARCHAR(42) NOT NULL,
    "dailyCapUsd" BIGINT NOT NULL,
    "perTxCapUsd" BIGINT NOT NULL,
    "cosignAboveUsd" BIGINT NOT NULL,
    "minCounterpartyTier" "TrustTier" NOT NULL,
    "allowSwaps" BOOLEAN NOT NULL,
    "allowUnknownContracts" BOOLEAN NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "epochStart" BIGINT NOT NULL DEFAULT 0,
    "spentThisEpochUsd" BIGINT NOT NULL DEFAULT 0,
    "hiredTxHash" VARCHAR(66),
    "hiredBlock" BIGINT,
    "hiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozenAt" TIMESTAMP(3),
    "lastSyncedBlock" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "policyId" TEXT,
    "agentId" TEXT,
    "counterpartyAgentId" TEXT,
    "type" "ActivityType" NOT NULL,
    "source" "ActivitySource" NOT NULL DEFAULT 'CHAIN',
    "blockReason" "BlockReason",
    "amountUsd" BIGINT,
    "tokenAddress" VARCHAR(42),
    "tokenAmountRaw" DECIMAL(78,0),
    "target" VARCHAR(42),
    "counterpartyAddress" VARCHAR(42),
    "txHash" VARCHAR(66),
    "logIndex" INTEGER,
    "blockNumber" BIGINT,
    "blockTimestamp" TIMESTAMP(3),
    "summary" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "pendingApprovalId" VARCHAR(66),
    "intentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingApproval" (
    "id" VARCHAR(66) NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "policyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "counterpartyAgentId" TEXT,
    "amountUsd" BIGINT NOT NULL,
    "target" VARCHAR(42) NOT NULL,
    "valueRaw" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "tokenAddress" VARCHAR(42),
    "tokenAmountRaw" DECIMAL(78,0),
    "calldata" TEXT NOT NULL,
    "decoded" JSONB NOT NULL DEFAULT '{}',
    "summary" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "proposedTxHash" VARCHAR(66) NOT NULL,
    "proposedBlock" BIGINT NOT NULL,
    "proposedAt" TIMESTAMP(3) NOT NULL,
    "resolvedTxHash" VARCHAR(66),
    "resolvedAt" TIMESTAMP(3),
    "resolutionSource" "ResolutionSource",
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "policyId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "kind" "ExecutionKind" NOT NULL,
    "target" VARCHAR(42) NOT NULL,
    "valueRaw" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "calldata" TEXT NOT NULL,
    "expectedUsd" BIGINT,
    "tokenAddress" VARCHAR(42),
    "tokenAmountRaw" DECIMAL(78,0),
    "meta" JSONB NOT NULL DEFAULT '{}',
    "status" "IntentStatus" NOT NULL DEFAULT 'PLANNED',
    "txHash" VARCHAR(66),
    "error" TEXT,
    "demoRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "address" VARCHAR(42) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "priceFeed" VARCHAR(42),
    "isStable" BOOLEAN NOT NULL DEFAULT false,
    "isNative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "feedAddress" VARCHAR(42) NOT NULL,
    "roundId" BIGINT NOT NULL,
    "priceUsd" BIGINT NOT NULL,
    "feedUpdatedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "key" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DemoSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Wallet_owner_idx" ON "Wallet"("owner");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_address_key" ON "Agent"("address");

-- CreateIndex
CREATE INDEX "Agent_kind_idx" ON "Agent"("kind");

-- CreateIndex
CREATE INDEX "Agent_trustTier_idx" ON "Agent"("trustTier");

-- CreateIndex
CREATE INDEX "Policy_agentId_idx" ON "Policy"("agentId");

-- CreateIndex
CREATE INDEX "Policy_walletAddress_frozen_idx" ON "Policy"("walletAddress", "frozen");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_walletAddress_sessionKey_key" ON "Policy"("walletAddress", "sessionKey");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_seq_key" ON "ActivityEvent"("seq");

-- CreateIndex
CREATE INDEX "ActivityEvent_walletAddress_createdAt_idx" ON "ActivityEvent"("walletAddress", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_walletAddress_type_createdAt_idx" ON "ActivityEvent"("walletAddress", "type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_agentId_createdAt_idx" ON "ActivityEvent"("agentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_blockNumber_idx" ON "ActivityEvent"("blockNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_txHash_logIndex_key" ON "ActivityEvent"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityEvent_intentId_type_key" ON "ActivityEvent"("intentId", "type");

-- CreateIndex
CREATE INDEX "PendingApproval_walletAddress_status_createdAt_idx" ON "PendingApproval"("walletAddress", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PendingApproval_agentId_status_idx" ON "PendingApproval"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Intent_txHash_key" ON "Intent"("txHash");

-- CreateIndex
CREATE INDEX "Intent_agentId_status_idx" ON "Intent"("agentId", "status");

-- CreateIndex
CREATE INDEX "Intent_demoRunId_idx" ON "Intent"("demoRunId");

-- CreateIndex
CREATE INDEX "Token_chainId_symbol_idx" ON "Token"("chainId", "symbol");

-- CreateIndex
CREATE INDEX "PriceSnapshot_symbol_fetchedAt_idx" ON "PriceSnapshot"("symbol", "fetchedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_feedAddress_roundId_key" ON "PriceSnapshot"("feedAddress", "roundId");

-- CreateIndex
CREATE INDEX "DemoSnapshot_active_takenAt_idx" ON "DemoSnapshot"("active", "takenAt" DESC);

-- CreateIndex
CREATE INDEX "DemoRun_beat_createdAt_idx" ON "DemoRun"("beat", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "Wallet"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "Wallet"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_counterpartyAgentId_fkey" FOREIGN KEY ("counterpartyAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_pendingApprovalId_fkey" FOREIGN KEY ("pendingApprovalId") REFERENCES "PendingApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "Intent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApproval" ADD CONSTRAINT "PendingApproval_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "Wallet"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApproval" ADD CONSTRAINT "PendingApproval_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApproval" ADD CONSTRAINT "PendingApproval_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingApproval" ADD CONSTRAINT "PendingApproval_counterpartyAgentId_fkey" FOREIGN KEY ("counterpartyAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intent" ADD CONSTRAINT "Intent_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "Wallet"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intent" ADD CONSTRAINT "Intent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intent" ADD CONSTRAINT "Intent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intent" ADD CONSTRAINT "Intent_demoRunId_fkey" FOREIGN KEY ("demoRunId") REFERENCES "DemoRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
