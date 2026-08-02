-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "ConfirmationSource" AS ENUM ('PAYMENT', 'MANUAL');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "confirmationSource" "ConfirmationSource",
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmationNote" TEXT;

-- Backfill expiresAt for existing BOOKED tickets (30 minutes from bookedAt)
UPDATE "Ticket"
SET "expiresAt" = "bookedAt" + INTERVAL '30 minutes'
WHERE "status" = 'BOOKED' AND "expiresAt" IS NULL;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "redirectUrl" TEXT,
    "returnToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_returnToken_key" ON "Payment"("returnToken");

-- CreateIndex
CREATE INDEX "Payment_checkoutId_idx" ON "Payment"("checkoutId");

-- CreateIndex
CREATE INDEX "Payment_checkoutId_status_idx" ON "Payment"("checkoutId", "status");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_expiresAt_idx" ON "Payment"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_providerEventId_key" ON "PaymentWebhookEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_paymentId_idx" ON "PaymentWebhookEvent"("paymentId");

-- CreateIndex
CREATE INDEX "Ticket_expiresAt_idx" ON "Ticket"("expiresAt");

-- Partial unique index: at most one active payment per checkout
CREATE UNIQUE INDEX "Payment_one_active_per_checkout"
ON "Payment" ("checkoutId")
WHERE "status" IN ('CREATED', 'PROCESSING');

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
