-- Las "áreas" pasan a ser "zonas" (agrupación que recorren los brigadistas).
-- Renombre sin pérdida de datos: tabla, columna, restricciones e índices.

ALTER TABLE "areas" RENAME TO "zones";
ALTER TABLE "zones" RENAME CONSTRAINT "areas_pkey" TO "zones_pkey";
ALTER TABLE "zones" RENAME CONSTRAINT "areas_siteId_fkey" TO "zones_siteId_fkey";
ALTER INDEX "areas_siteId_code_key" RENAME TO "zones_siteId_code_key";
ALTER INDEX "areas_siteId_active_idx" RENAME TO "zones_siteId_active_idx";

ALTER TABLE "elements" RENAME COLUMN "areaId" TO "zoneId";
ALTER TABLE "elements" RENAME CONSTRAINT "elements_areaId_fkey" TO "elements_zoneId_fkey";
CREATE INDEX "elements_zoneId_status_idx" ON "elements"("zoneId", "status");

-- El rol de inspección se denomina "Brigadista" (solo si no fue renombrado por el administrador).
UPDATE "roles" SET "name" = 'Brigadista', "description" = 'Realiza inspecciones por zonas y registra hallazgos'
WHERE "code" = 'INSPECTOR' AND "name" = 'Inspector';
