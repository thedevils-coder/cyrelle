-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "VerificationStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "VerificationStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "VerificationStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "UserVerification" ADD COLUMN     "canRetry" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "externalUserId" TEXT,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "lastProviderEventAt" TIMESTAMP(3),
ADD COLUMN     "providerApplicantId" TEXT,
ADD COLUMN     "providerInspectionId" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewReason" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "verificationType" TEXT NOT NULL DEFAULT 'identity',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "IdentityVerificationEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "verificationId" TEXT,
    "mappedStatus" "VerificationStatus",
    "reviewAnswer" TEXT,
    "reviewRejectType" TEXT,
    "sandboxMode" BOOLEAN NOT NULL DEFAULT false,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdentityVerificationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityVerificationEvent_userId_createdAt_idx" ON "IdentityVerificationEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "IdentityVerificationEvent_verificationId_idx" ON "IdentityVerificationEvent"("verificationId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerificationEvent_provider_eventId_key" ON "IdentityVerificationEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "UserVerification_providerApplicantId_key" ON "UserVerification"("providerApplicantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserVerification_externalUserId_key" ON "UserVerification"("externalUserId");

-- CreateIndex
CREATE INDEX "UserVerification_provider_status_idx" ON "UserVerification"("provider", "status");

-- AddForeignKey
ALTER TABLE "IdentityVerificationEvent" ADD CONSTRAINT "IdentityVerificationEvent_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "UserVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
