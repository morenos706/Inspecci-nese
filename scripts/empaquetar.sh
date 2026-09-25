#!/usr/bin/env sh
# Crea el paquete de entrega (código + configuración + documentación) desde git.
# No incluye secretos (.env*), dependencias (node_modules) ni datos.
# Uso: sh scripts/empaquetar.sh   → dist/inspecciones-emergencia-<versión>.zip
set -eu
VERSION="$(node -p "require('./package.json').version")"
NAME="inspecciones-emergencia-$VERSION"
mkdir -p dist
git archive --format=zip --prefix="$NAME/" -o "dist/$NAME.zip" HEAD
ls -lh "dist/$NAME.zip"
