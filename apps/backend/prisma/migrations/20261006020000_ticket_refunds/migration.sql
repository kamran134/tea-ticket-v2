-- AlterEnum
ALTER TYPE "TicketStatus" ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "ticketIds" TEXT[],
    "approvalCode" TEXT,
    "pmoResultCode" TEXT,
    "partial" BOOLEAN NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRefund_paymentId_idx" ON "PaymentRefund"("paymentId");

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Grant the new permission to the seeded Admin role. Super Admin bypasses the
-- list. Manager stays without it until someone assigns the permission by hand.
UPDATE "AdminRole"
SET "permissions" = array_append("permissions", 'tickets.refund')
WHERE "slug" = 'admin'
  AND NOT ('tickets.refund' = ANY("permissions"));
