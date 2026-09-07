-- CreateTable
CREATE TABLE "SiweNonce" (
    "nonce" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiweNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiweNonce_address_idx" ON "SiweNonce"("address");

-- CreateIndex
CREATE INDEX "Session_address_idx" ON "Session"("address");
