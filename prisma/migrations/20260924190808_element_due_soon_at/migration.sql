-- AlterTable
ALTER TABLE "elements" ADD COLUMN     "dueSoonAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "elements_status_dueSoonAt_idx" ON "elements"("status", "dueSoonAt");

-- Backfill: misma regla que dueSoonDate() en src/lib/scheduling.ts
-- (ventana: diaria 1, semanal 1, quincenal 3, personalizada min(7, días/4) con mínimo 1, resto 7 días).
UPDATE "elements"
SET "dueSoonAt" = "nextInspectionAt" - (
  CASE "frequency"
    WHEN 'DAILY' THEN 1
    WHEN 'WEEKLY' THEN 1
    WHEN 'BIWEEKLY' THEN 3
    WHEN 'CUSTOM' THEN GREATEST(1, LEAST(7, COALESCE("frequencyDays", 0) / 4))
    ELSE 7
  END
) * INTERVAL '1 day'
WHERE "nextInspectionAt" IS NOT NULL;
