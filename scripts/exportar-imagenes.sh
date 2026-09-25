#!/usr/bin/env sh
# Instalación SIN INTERNET en el servidor de la empresa.
# 1) En un equipo CON internet y Docker, dentro de la carpeta del proyecto:
#      cp .env.production.example .env.production && ln -sf .env.production .env   (valores de ejemplo bastan para construir)
#      sh scripts/exportar-imagenes.sh
#    Genera dist/imagenes-inspecciones.tar (≈ 400–600 MB).
# 2) Copia al servidor la carpeta del proyecto + ese archivo y ejecuta allí:
#      docker load -i dist/imagenes-inspecciones.tar
#      docker compose -f docker-compose.prod.yml up -d --no-build
set -eu
mkdir -p dist
docker compose -f docker-compose.prod.yml build
docker pull postgres:16-alpine
docker pull caddy:2-alpine
docker save -o dist/imagenes-inspecciones.tar inspecciones-app:latest inspecciones-migrate:latest postgres:16-alpine caddy:2-alpine
ls -lh dist/imagenes-inspecciones.tar
