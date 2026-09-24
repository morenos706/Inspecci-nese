-- AlterTable
ALTER TABLE "elements" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "expiryLabel" TEXT;

-- AlterTable
ALTER TABLE "inspection_questions" ADD COLUMN     "tracksExpiry" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "elements_status_expiresAt_idx" ON "elements"("status", "expiresAt");
