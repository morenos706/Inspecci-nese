-- CreateEnum
CREATE TYPE "FindingSource" AS ENUM ('INSPECTION', 'MANUAL', 'EXPIRY');

-- AlterTable
ALTER TABLE "action_plan_events" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "action_plans" ADD COLUMN     "solvedById" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "source" "FindingSource" NOT NULL DEFAULT 'INSPECTION',
ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "findings_dedupeKey_key" ON "findings"("dedupeKey");

-- CreateIndex
CREATE INDEX "findings_elementId_source_status_idx" ON "findings"("elementId", "source", "status");

-- AddForeignKey
ALTER TABLE "action_plans" ADD CONSTRAINT "action_plans_solvedById_fkey" FOREIGN KEY ("solvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

