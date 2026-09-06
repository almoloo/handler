-- CreateTable
CREATE TABLE "DemoRun" (
    "id" TEXT NOT NULL,
    "beat" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "log" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoRun_pkey" PRIMARY KEY ("id")
);
