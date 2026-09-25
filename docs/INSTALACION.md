# Instalación en el servidor de la empresa

Guía para el equipo de TI. Instala el **Sistema de Inspecciones de Equipos de
Emergencia** en un servidor propio (físico o virtual), sin depender de ninguna
nube. Tiempo estimado: **1 hora** con el servidor listo.

> Resumen técnico: aplicación web en **TypeScript** (Next.js 16 sobre Node.js 22),
> base de datos **PostgreSQL 16**, empaquetada en **4 contenedores Docker**.
> Todo el software es de código abierto, sin licencias.

---

## 1. Cómo está armado

```
 Celulares y computadores (navegador / app instalable)
            │ HTTPS 443
            ▼
 ┌──────────────────────── servidor ────────────────────────┐
 │  caddy      → proxy HTTPS (certificado)                  │
 │  app        → aplicación Next.js (Node.js 22), puerto 3000│
 │  postgres   → base de datos PostgreSQL 16                 │
 │  migrate    → se ejecuta al arrancar: crea/actualiza la   │
 │               base de datos y la cuenta de Super Admin    │
 │  Volúmenes: pgdata (base de datos) · uploads (fotos)      │
 └───────────────────────────────────────────────────────────┘
            │ SMTP 587 (salida)
            ▼
     Servidor de correo de la empresa (notificaciones)
```

- **Datos**: la base de datos y las fotos quedan en el propio servidor (volúmenes
  Docker `pgdata` y `uploads`). Opcional: fotos en un almacenamiento S3 propio
  (MinIO, NetApp, etc.).
- **Tareas automáticas**: la aplicación revisa cada hora vencimientos,
  recordatorios y envía los correos pendientes. No requiere cron.

## 2. Requisitos

| Recurso | Mínimo | Recomendado |
|---|---|---|
| Sistema operativo | Linux x86-64: Ubuntu Server 22.04/24.04 LTS, RHEL / Rocky / AlmaLinux 9 o Debian 12 | Ubuntu Server 24.04 LTS |
| CPU / RAM | 2 vCPU / 4 GB | 4 vCPU / 8 GB |
| Disco | 40 GB | 100 GB SSD (fotos: ~5 GB por año con 800 equipos) |
| Software | Docker Engine 24+ con el plugin Docker Compose v2 | — |
| Red (entrada) | 443/TCP (y 80/TCP si se usa Let's Encrypt) desde la red de los usuarios | — |
| Red (salida) | SMTP (587) hacia el servidor de correo | Durante la instalación: acceso a Docker Hub y npm (o usar la instalación sin internet, §9) |
| Nombre y certificado | Un nombre DNS (ej.: `inspecciones.empresa.com`) y certificado HTTPS válido | — |

> **Servidores Windows**: crear una máquina virtual Linux (Hyper-V o VMware) y
> seguir esta guía dentro de ella.
>
> **HTTPS es obligatorio**: sin un certificado válido los celulares no permiten
> usar la cámara (escaneo de QR y fotos). Ver §5.

## 3. Instalar Docker (una sola vez)

**Ubuntu / Debian**

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl unzip
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
sudo systemctl enable --now docker
docker compose version     # debe mostrar v2.x o superior
```

**RHEL / Rocky / AlmaLinux 9**

```bash
sudo dnf -y install dnf-plugins-core unzip
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Copiar y configurar

```bash
sudo mkdir -p /opt/inspecciones && sudo chown $USER /opt/inspecciones
cd /opt/inspecciones
unzip ~/inspecciones-emergencia-1.0.0.zip
mv inspecciones-emergencia-1.0.0/* inspecciones-emergencia-1.0.0/.[!.]* . && rmdir inspecciones-emergencia-1.0.0
cp .env.production.example .env.production
ln -sf .env.production .env        # docker compose lee las variables de .env
chmod 600 .env.production
nano .env.production
```

Valores que **se deben** definir en `.env.production`:

| Variable | Qué poner |
|---|---|
| `DOMAIN` | Nombre DNS del sistema, sin https (ej.: `inspecciones.empresa.com`) |
| `APP_URL` | La dirección completa: `https://inspecciones.empresa.com` |
| `POSTGRES_PASSWORD` | Secreto generado: `openssl rand -hex 24` |
| `AUTH_SECRET` | Secreto generado: `openssl rand -hex 32` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Servidor de correo de la empresa (ver tabla abajo) |
| `SEED_ADMIN_EMAIL` | Correo de la **cuenta general de Super Administrador** |
| `SEED_DEFAULT_PASSWORD` | Clave temporal de esa cuenta (sin espacios ni `#`); se cambia en el primer ingreso |
| `APP_TIMEZONE`, `NEXT_PUBLIC_APP_TIMEZONE` | Zona horaria (por defecto `America/Bogota`) |

Correo (notificaciones):

| Proveedor | `SMTP_HOST` | `SMTP_PORT` | `SMTP_SECURE` | Notas |
|---|---|---|---|---|
| Microsoft 365 | `smtp.office365.com` | 587 | false | La cuenta debe tener habilitado "SMTP autenticado" |
| Google Workspace / Gmail | `smtp.gmail.com` | 587 | false | Usar **contraseña de aplicación** (requiere verificación en 2 pasos) |
| Relay interno (Exchange, Postfix) | nombre del servidor | 25 o 587 | false | `SMTP_USER` vacío si el relay no pide autenticación |

## 5. Elegir cómo se publica el HTTPS

Elija **una** de las tres opciones. El comando de arranque cambia según la opción.

| Opción | Cuándo usarla | Comando (`COMPOSE`) |
|---|---|---|
| **A. Certificado automático** (Let's Encrypt) | El nombre DNS es público y el servidor recibe tráfico de internet en los puertos 80 y 443 | `docker compose -f docker-compose.prod.yml` |
| **B. Certificado de la empresa** | Servidor interno; TI tiene un certificado (CA pública o CA corporativa instalada en los equipos) | `docker compose -f docker-compose.prod.yml -f docker-compose.certificado.yml` |
| **C. Proxy existente de la empresa** | Ya existe un proxy/balanceador con HTTPS (IIS ARR, nginx, Apache, F5, FortiGate…) | `docker compose -f docker-compose.prod.yml -f docker-compose.proxy-externo.yml` |

**Opción B**: copie el certificado en la carpeta `certs/` (instrucciones en
`certs/LEEME.txt`): `certificado.crt` (sitio + intermedios, PEM) y
`certificado.key` (llave PEM sin contraseña). Para `.pfx`:

```bash
openssl pkcs12 -in archivo.pfx -clcerts -nokeys -out certs/certificado.crt
openssl pkcs12 -in archivo.pfx -nocerts -nodes  -out certs/certificado.key
chmod 600 certs/certificado.key
```

**Opción C**: la aplicación queda en HTTP en el puerto `3000` (cambiable con
`APP_PORT`; con `APP_BIND=127.0.0.1` solo escucha localmente). El proxy de la
empresa debe terminar HTTPS y reenviar a `http://SERVIDOR:3000` conservando el
encabezado `Host` (o enviando `X-Forwarded-Host`) y enviando
`X-Forwarded-Proto: https`. Límite de subida recomendado: 15 MB. Ejemplo nginx:

```nginx
location / {
    proxy_pass http://10.0.0.20:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 15m;
}
```

Restrinja con el firewall el acceso al puerto 3000 para que solo lo alcance el proxy.

## 6. Arrancar

```bash
cd /opt/inspecciones
COMPOSE="docker compose -f docker-compose.prod.yml"      # o la variante B / C de la tabla anterior
$COMPOSE up -d --build          # la primera vez tarda 5–10 minutos (construye la aplicación)
$COMPOSE ps                     # postgres, app y caddy en "running"; migrate en "exited (0)"
$COMPOSE logs migrate | tail -5 # "Cuenta general de Super Administrador creada: …"
curl -k https://inspecciones.empresa.com/api/health     # {"status":"ok"}
```

Los contenedores se reinician solos si el servidor se reinicia (`restart: unless-stopped`).

## 7. Primer ingreso y puesta en marcha

1. Abra `https://inspecciones.empresa.com` e ingrese con `SEED_ADMIN_EMAIL` y
   `SEED_DEFAULT_PASSWORD`. El sistema pide cambiar la contraseña.
   La instalación queda **limpia**: sin datos de prueba y con **una sola cuenta**,
   la del Super Administrador.
2. **Mi cuenta → Correo del sistema → Enviar correo de prueba**: confirma que
   las notificaciones salen (si falla, muestra la causa exacta).
3. **Administración → Correos**: nombre de la empresa, colores, logo y textos de
   los correos.
4. **Carga masiva**: suba el Excel con sedes, procesos, **usuarios**, tipos de
   equipo con sus preguntas, zonas e inventario. El paquete incluye
   `datos-iniciales/Carga_inicial_equipos_emergencia.xlsx` (3 sedes, 9 tipos,
   128 preguntas, 791 equipos). Los usuarios nuevos reciben un correo para
   definir su contraseña.
5. **Inventario → Etiquetas QR**: imprima y pegue las etiquetas.
6. En los celulares: abrir la dirección y **Agregar a pantalla de inicio**.

## 8. Operación

**Respaldos (obligatorio)**: base de datos + fotos, conserva 30 días.

```bash
sh scripts/respaldo.sh                     # manual
crontab -e                                 # diario a las 2:00 a. m.:
0 2 * * * cd /opt/inspecciones && sh scripts/respaldo.sh >> backups/respaldo.log 2>&1
```

Copie la carpeta `backups/` al sistema de respaldo de la empresa (otro servidor
o almacenamiento). Restaurar: `sh scripts/restaurar.sh backups/db-….dump backups/fotos-….tgz`.

**Actualizar a una versión nueva**: reemplace los archivos del proyecto por los
del nuevo paquete **conservando** `.env.production`, `.env`, `certs/` y `backups/`, y ejecute:

```bash
sh scripts/respaldo.sh
$COMPOSE up -d --build      # las migraciones de base de datos se aplican solas
```

**Comandos útiles**

| Para | Comando |
|---|---|
| Ver estado | `$COMPOSE ps` |
| Ver registros | `$COMPOSE logs -f app` (correo: `$COMPOSE logs app \| grep -i mail`) |
| Reiniciar | `$COMPOSE restart app` |
| Aplicar cambios de `.env.production` | `$COMPOSE up -d --force-recreate app` |
| Detener / iniciar | `$COMPOSE stop` / `$COMPOSE start` |
| Monitoreo | `GET /api/health` → `{"status":"ok"}` |
| Borrar solo los datos de operación (conserva usuarios) | ver `scripts/reset-datos.sql` |

## 9. Instalación sin internet

Si el servidor no tiene salida a internet:

1. En un equipo con internet y Docker, dentro de la carpeta del proyecto:
   `cp .env.production.example .env.production && ln -sf .env.production .env && sh scripts/exportar-imagenes.sh`
   → genera `dist/imagenes-inspecciones.tar`.
2. Copie la carpeta del proyecto y ese archivo al servidor, configure
   `.env.production` (§4) y ejecute:

```bash
docker load -i dist/imagenes-inspecciones.tar
$COMPOSE up -d --no-build
```

## 10. Seguridad (lista de verificación)

- [ ] `.env.production` con permisos `600` y secretos generados (nunca los de ejemplo).
- [ ] Firewall: solo 443 (y 80 si opción A) abiertos a los usuarios; SSH solo desde la red de TI.
- [ ] La base de datos **no** se publica: PostgreSQL solo es accesible dentro de Docker.
- [ ] Respaldos diarios copiados fuera del servidor y restauración probada.
- [ ] Actualizaciones del sistema operativo y de Docker al día.
- [ ] La cuenta de Super Administrador cambió su clave temporal; cada persona usa su propio usuario.

Controles incluidos en la aplicación: contraseñas cifradas (bcrypt), sesiones
revocables con vencimiento, bloqueo por intentos fallidos, roles y permisos
validados en el servidor, auditoría de cambios, archivos validados por su
contenido y servidos solo a usuarios autorizados, encabezados de seguridad
(CSP, HSTS).

## 11. Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `required variable … is missing a value` | Falta el acceso directo: `ln -sf .env.production .env` |
| `Configuración de entorno inválida` en `logs app` | Falta o está mal una variable de `.env.production` |
| El sitio no abre con HTTPS (opción A) | El DNS debe apuntar al servidor y los puertos 80/443 estar abiertos desde internet; ver `$COMPOSE logs caddy` |
| El navegador marca el certificado como no seguro (opción B) | El `.crt` debe incluir los intermedios y la CA debe estar instalada en los equipos/celulares |
| Error 403 al guardar o subir archivos (opción C) | El proxy no conserva `Host` / no envía `X-Forwarded-Host` |
| La cámara no abre en el celular | Requiere HTTPS válido y permitir la cámara en el navegador |
| No llegan los correos | *Mi cuenta → Enviar correo de prueba* muestra la causa (clave, puerto, relay) |
| Olvidé la clave del Super Administrador | En la pantalla de ingreso: *¿Olvidaste tu contraseña?* (requiere el correo configurado) o, desde otro administrador, *Usuarios → Restablecer contraseña* |

---

Documentación relacionada: `README.md` (funcionalidades), `docs/ARCHITECTURE.md`
(arquitectura y decisiones técnicas), `docs/DESPLIEGUE.md` (pruebas locales y
publicación en la nube).
