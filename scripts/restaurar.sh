#!/usr/bin/env sh
# Restaura un respaldo creado con scripts/respaldo.sh (REEMPLAZA los datos actuales).
# Uso: sh scripts/restaurar.sh backups/db-AAAA-MM-DD_HHMM.dump [backups/fotos-AAAA-MM-DD_HHMM.tgz]
set -eu
[ $# -ge 1 ] || { echo "Uso: sh scripts/restaurar.sh <db.dump> [fotos.tgz]"; exit 1; }
COMPOSE="docker compose -f docker-compose.prod.yml"
DB_USER="${POSTGRES_USER:-inspecciones}"
DB_NAME="${POSTGRES_DB:-inspecciones}"
printf "Esto REEMPLAZA la base de datos actual con %s. Escribe SI para continuar: " "$1"
read -r ok
[ "$ok" = "SI" ] || { echo "Cancelado."; exit 1; }

$COMPOSE stop app
$COMPOSE exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$1"
$COMPOSE start app
if [ $# -ge 2 ]; then
  $COMPOSE exec -T app sh -c 'rm -rf /app/storage/* && tar xzf - -C /app/storage' < "$2"
fi
echo "Restauración terminada."
