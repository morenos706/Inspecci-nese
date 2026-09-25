-- CreateEnum
CREATE TYPE "InspectionReview" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "reviewStatus" "InspectionReview",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX "inspections_reviewStatus_completedAt_idx" ON "inspections"("reviewStatus", "completedAt");

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Inspecciones ya finalizadas: sin hallazgos → archivadas; con hallazgos →
-- revisadas (en el flujo anterior sus planes se asignaban al registrarlas).
UPDATE "inspections" i
SET "reviewStatus" = CASE
      WHEN EXISTS (SELECT 1 FROM "findings" f WHERE f."inspectionId" = i."id") THEN 'REVIEWED'::"InspectionReview"
      ELSE 'ARCHIVED'::"InspectionReview"
    END,
    "reviewedAt" = i."completedAt"
WHERE i."status" = 'COMPLETED';
