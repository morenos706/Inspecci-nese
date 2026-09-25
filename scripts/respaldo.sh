#!/usr/bin/env sh
# Respaldo completo: base de datos + fotos/documentos.
# Uso (desde la carpeta del proyecto):   sh scripts/respaldo.sh
# Programado a diario (crontab -e):       0 2 * * * cd /opt/inspecciones && sh scripts/respaldo.sh >> backups/respaldo.log 2>&1
# Conserva 30 días. Copia la carpeta backups/ a otro servidor o a la unidad de respaldos de la empresa.
set -eu
COMPOSE="docker compose -f docker-compose.prod.yml"
DB_USER="${POSTGRES_USER:-inspecciones}"
DB_NAME="${POSTGRES_DB:-inspecciones}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p backups

echo "[$(date)] Respaldo de la base de datos…"
$COMPOSE exec -T postgres pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "backups/db-$STAMP.dump"

echo "[$(date)] Respaldo de fotos y documentos…"
$COMPOSE exec -T app tar czf - -C /app/storage . > "backups/fotos-$STAMP.tgz"

find backups -name "db-*.dump" -mtime +30 -delete
find backups -name "fotos-*.tgz" -mtime +30 -delete
echo "[$(date)] Listo: backups/db-$STAMP.dump y backups/fotos-$STAMP.tgz"
