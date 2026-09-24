# Cómo implementar el sistema (paso a paso)

Esta guía lleva el sistema desde el código hasta el uso real por los
brigadistas en el celular. Tiene tres etapas:

1. **Probarlo en tu computador** (30 minutos).
2. **Publicarlo en un servidor** con dominio y HTTPS (1–2 horas).
3. **Ponerlo en marcha en la empresa**: configuración inicial, capacitación e
   instalación en los celulares.

---

## Etapa 1 — Probarlo en tu computador

### 1.1 Instalar las herramientas (una sola vez)

| Herramienta | Para qué | Descarga |
|---|---|---|
| **Node.js 22 LTS** | Ejecutar la aplicación | https://nodejs.org |
| **Git** | Descargar el código | https://git-scm.com |
| **Docker Desktop** | Base de datos, fotos y correo de prueba | https://www.docker.com/products/docker-desktop |

Verifica en una terminal (PowerShell en Windows, Terminal en Mac):

```bash
node -v      # v22.x
git --version
docker --version
```

### 1.2 Descargar y arrancar

```bash
git clone https://github.com/morenos706/Inspecci-nese.git
cd Inspecci-nese
git checkout claude/emergency-inspections-app-3yxq4p   # rama con el desarrollo

npm install                 # dependencias (1–3 min)
cp .env.example .env        # configuración local (en Windows: copy .env.example .env)
docker compose up -d        # PostgreSQL y Mailpit (correo de prueba)
npm run db:deploy           # crea las tablas
npm run db:seed             # permisos, roles y datos de demostración
npm run dev                 # inicia la aplicación
```

Abre **http://localhost:3000** e ingresa con `admin@inspecciones.local` /
`Cambiar123*`. Los demás usuarios de prueba están en el `README.md`.

- Correos (recuperar contraseña, invitaciones): http://localhost:8025
- Fotos subidas: carpeta `.storage/` del proyecto

### 1.3 Probarlo desde tu celular (misma red Wi-Fi)

```bash
npm run dev -- -H 0.0.0.0
```

Averigua la IP de tu computador (`ipconfig` en Windows / `ifconfig` en Mac,
p.ej. `192.168.1.20`) y abre `http://192.168.1.20:3000` en el celular.
La cámara del celular solo funciona sobre HTTPS; para probar fotos desde el
celular usa la Etapa 2 o elige fotos de la galería.

---

## Etapa 2 — Publicarlo en un servidor (producción)

### 2.1 Qué necesitas

| Recurso | Recomendación | Costo aproximado |
|---|---|---|
| Servidor (VPS) Linux | Ubuntu 24.04, **2 vCPU, 4 GB RAM, 60 GB disco** (DigitalOcean, AWS Lightsail, Hetzner, Vultr, Azure, un servidor propio…) | 12–25 USD/mes |
| Dominio o subdominio | p.ej. `inspecciones.miempresa.com` (lo crea el área de TI) | incluido si ya tienen dominio |
| Cuenta de correo SMTP | Microsoft 365 / Google Workspace / Amazon SES | normalmente ya existe |

Con esto funcionan sin problema cientos de elementos y decenas de usuarios
simultáneos. Las fotos se guardan comprimidas (~0,5 MB c/u).

### 2.2 Apuntar el dominio al servidor

En el panel DNS de tu dominio crea un registro **A**:
`inspecciones` → `IP pública del servidor`. Espera unos minutos a que propague.

### 2.2-bis Crear el servidor en AWS EC2 (si usas Amazon Web Services)

En **EC2 → Lanzar una instancia**:

| Sección | Valor |
|---|---|
| Nombre | `Inspecciones` |
| Imagen (AMI) | **Ubuntu Server 24.04 LTS** (64 bits x86). Los comandos de esta guía son para Ubuntu |
| Tipo de instancia | **t3.medium** (2 vCPU, 4 GB). Mínimo aceptable: t3.small (2 GB) + memoria swap (ver 2.3). **No uses t3.micro** (1 GB): no alcanza para compilar la aplicación |
| Par de claves | *Crear un nuevo par de claves* → tipo ED25519, formato `.pem` → se descarga: guárdalo, es la llave del servidor |
| Configuración de red | *Permitir tráfico SSH* desde **Mi IP**; marcar **Permitir tráfico HTTPS** y **Permitir tráfico HTTP** desde Internet. Para usar el botón *Conectar → EC2 Instance Connect* agrega además la regla SSH con origen en la lista de prefijos `com.amazonaws.<región>.ec2-instance-connect` (ver Problemas frecuentes) |
| Almacenamiento | **30 GiB gp3** (8 GiB no alcanza para Docker + fotos) |

Después de lanzarla:

1. **IP fija**: EC2 → *Direcciones IP elásticas* → *Asignar* → *Asociar* a la
   instancia. Sin esto la IP cambia cada vez que se detiene el servidor.
2. **Dominio**: crea el registro **A** del subdominio hacia la IP elástica.
   ¿Aún no tienes dominio? Para el piloto puedes usar
   `DOMAIN=3-15-20-1.sslip.io` (tu IP elástica con guiones): resuelve solo a
   esa IP y Caddy obtiene el certificado HTTPS igual.
3. **Conectarte** (Mac/Linux; en Windows usa PowerShell):
   ```bash
   chmod 400 ~/Downloads/inspecciones.pem
   ssh -i ~/Downloads/inspecciones.pem ubuntu@IP_ELASTICA
   ```
   También puedes usar el botón **Conectar → EC2 Instance Connect** de la consola.
4. **Control de costos**: en *Billing → Budgets* crea un presupuesto mensual
   con alerta por correo.

En AWS el cortafuegos es el *grupo de seguridad* (puertos 22, 80 y 443); el
paso de `ufw` de la sección siguiente es opcional.

### 2.3 Preparar el servidor (una sola vez)

Conéctate por SSH (`ssh usuario@IP`) y ejecuta:

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Cortafuegos: solo SSH, HTTP y HTTPS (en AWS ya lo hace el grupo de seguridad)
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

# Memoria swap de 4 GB (necesaria con 2 GB de RAM; recomendable siempre para compilar)
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Código
git clone https://github.com/morenos706/Inspecci-nese.git
cd Inspecci-nese
git checkout claude/emergency-inspections-app-3yxq4p
```

### 2.4 Configurar

```bash
cp .env.production.example .env.production
openssl rand -hex 24      # ejecútalo varias veces para generar cada secreto
nano .env.production      # completa los valores
```

Valores que **debes** cambiar:

| Variable | Qué poner |
|---|---|
| `DOMAIN` / `APP_URL` | tu dominio (`inspecciones.miempresa.com` / `https://inspecciones.miempresa.com`) |
| `POSTGRES_PASSWORD` | un secreto generado |
| `AUTH_SECRET` | un secreto generado (mínimo 32 caracteres) |
| `SMTP_*` / `MAIL_FROM` | datos del correo de la empresa (pídelos a TI) |
| `SEED_ADMIN_EMAIL` / `SEED_DEFAULT_PASSWORD` | tu correo y una clave inicial (el sistema pedirá cambiarla) |

### 2.5 Arrancar

```bash
# Acceso directo: así docker compose lee .env.production en TODOS los comandos (ps, logs, up…)
ln -sf .env.production .env
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml logs -f app      # ver que inició (Ctrl+C para salir)
```

Esto construye la aplicación, crea la base de datos, aplica las migraciones,
crea el administrador inicial y obtiene el **certificado HTTPS automáticamente**.
Abre `https://inspecciones.miempresa.com` e ingresa con `SEED_ADMIN_EMAIL`.

### 2.6 Copias de seguridad (obligatorio)

Copia diaria a las 2 a.m. de la base de datos y de las fotos (volumen
`uploads`), conservando 30 días:

```bash
mkdir -p ~/Inspecci-nese/backups
crontab -e
# agrega estas dos líneas (ajusta la ruta del proyecto):
0 2 * * * cd /home/ubuntu/Inspecci-nese && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U inspecciones -Fc inspecciones > backups/db-$(date +\%F).dump && find backups -name "db-*.dump" -mtime +30 -delete
30 2 * * * cd /home/ubuntu/Inspecci-nese && docker run --rm -v inspecci-nese_uploads:/data:ro -v $PWD/backups:/b alpine tar czf /b/fotos-$(date +\%F).tgz -C /data . && find backups -name "fotos-*.tgz" -mtime +30 -delete
```

(`docker volume ls` muestra el nombre exacto del volumen; normalmente
`inspecci-nese_uploads`.) Copia la carpeta `backups/` a otro lugar (otro
servidor, S3, OneDrive…) al menos una vez por semana. En AWS también puedes
programar *snapshots* del disco EBS (EC2 → Data Lifecycle Manager).

Restaurar una copia:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U inspecciones -d inspecciones --clean < backups/db-AAAA-MM-DD.dump
```

### 2.7 Actualizar a una nueva versión

```bash
cd Inspecci-nese
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Las migraciones se aplican solas antes de iniciar la nueva versión.

### 2.8 Alternativas al servidor propio

- **Base de datos gestionada** (AWS RDS, Azure Database for PostgreSQL, Neon):
  pon su `DATABASE_URL` en `.env.production` y quita el servicio `postgres`.
- **Fotos en Amazon S3** (en vez del volumen del servidor): crea un bucket
  **privado** en la misma región; en IAM crea un **rol para EC2** con permiso
  `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` solo sobre ese bucket y
  asígnalo a la instancia (*Acciones → Seguridad → Modificar rol de IAM*). En
  `.env.production`: `STORAGE_DRIVER=s3`, `S3_REGION`, `S3_BUCKET`,
  `S3_FORCE_PATH_STYLE=false` y **sin llaves** (se usa el rol). Para Cloudflare
  R2: `S3_ENDPOINT=https://<cuenta>.r2.cloudflarestorage.com` y sus llaves.
- **Varios servidores**: pon `INTERNAL_SCHEDULER=false`, define `CRON_SECRET` y
  programa cada hora `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://tu-dominio/api/cron/run`.

---

## Etapa 3 — Ponerlo en marcha en la empresa

### 3.1 Configuración inicial (administrador, ~1 día)

Sigue este orden; cada paso depende del anterior:

1. **Mi cuenta** → cambia la contraseña inicial.
2. **Procesos** → Seguridad, Producción, Mantenimiento…
3. **Sedes y zonas** → cada sede y sus zonas de recorrido (Zona 1, Zona 2…).
4. **Tipos y preguntas** → Extintor, Botiquín, Camilla… con sus preguntas.
   Para extintores agrega una pregunta de **Fecha** "Fecha de vencimiento de la
   recarga" y marca *"Es la fecha de vencimiento del elemento"*.
5. **Usuarios** → crea brigadistas, responsables de proceso, responsables de
   acción y gerencia (si dejas la contraseña vacía reciben un correo de invitación).
   Asigna a los responsables de proceso sus **procesos**.
6. **Inventario** → registra los elementos: tipo, código, zona, responsable,
   frecuencia, última inspección y fecha de vencimiento (recarga).

> Para cargar muchos elementos de una vez, envíame el inventario en Excel y lo
> importamos (se puede agregar una importación masiva).

### 3.2 Instalar la app en los celulares (brigadistas)

- **Android (Chrome)**: abre el sitio → menú ⋮ → **Instalar aplicación**.
- **iPhone (Safari)**: abre el sitio → botón Compartir → **Agregar a pantalla de inicio**.

Queda un ícono como cualquier app. La primera vez que tomen una foto, el
celular pedirá permiso para usar la cámara: deben **permitirlo**.

### 3.3 Capacitación sugerida (30 minutos por grupo)

| Rol | Qué mostrar |
|---|---|
| Brigadistas | Mis inspecciones → zona → Inspeccionar → responder, hallazgo al decir NO, foto, finalizar |
| Responsables de acción | Planes → iniciar gestión → evidencia (foto/PDF) → marcar solucionado |
| Responsables de proceso | Hallazgos y planes de su proceso, verificar soluciones, indicadores |
| Gerencia | Indicadores (filtros por fecha, proceso, sede) e historial |

### 3.4 Piloto recomendado

1. Semana 1: una sede y un tipo de elemento (p.ej. extintores) con 2–3 brigadistas.
2. Semana 2: ajustar preguntas y zonas con lo aprendido.
3. Semana 3 en adelante: resto de sedes y tipos.

---

## Problemas frecuentes en producción

| Síntoma | Solución |
|---|---|
| `pull access denied for minio/mc` al arrancar | Versión anterior del proyecto (MinIO dejó de publicar sus imágenes). Ejecuta `git pull` y vuelve a `docker compose -f docker-compose.prod.yml up -d --build`; las fotos ahora van en el volumen `uploads` o en S3 |
| `permission denied ... docker.sock` | Tu sesión aún no tiene el grupo `docker`: ejecuta `newgrp docker` o sal y vuelve a entrar |
| AWS: *Failed to connect to your instance* al usar **EC2 Instance Connect** | Instance Connect entra desde servidores de AWS, no desde tu IP. En la instancia → pestaña **Seguridad** → grupo de seguridad → **Editar reglas de entrada** → **Agregar regla**: Tipo *SSH*, Origen *Personalizado* → lista de prefijos `com.amazonaws.us-east-2.ec2-instance-connect` (cambia la región si no es Ohio) → Guardar. Verifica también que la instancia esté *En ejecución* con *2/2 comprobaciones superadas* y tenga IP pública |
| AWS: `ssh` desde tu computador se queda esperando | Tu IP cambió (internet residencial/móvil): edita la regla SSH y vuelve a elegir **Mi IP**. Usuario: `ubuntu` (Ubuntu) o `ec2-user` (Amazon Linux) |
| El sitio no abre con HTTPS | Revisa que el registro DNS apunte a la IP y que los puertos 80/443 estén abiertos; mira `docker compose -f docker-compose.prod.yml logs caddy` |
| `Configuración de entorno inválida` en los logs | Falta o está mal una variable de `.env.production` |
| No llegan los correos | Verifica `SMTP_*`; en Microsoft 365 la cuenta debe tener habilitado "SMTP autenticado" |
| No se pueden tomar fotos | La cámara exige HTTPS y el permiso de cámara en el navegador del celular |
| No inicia la sesión tras actualizar | Borra las cookies del sitio; las sesiones se conservan en la base de datos |
| Ver el estado de los servicios | `docker compose -f docker-compose.prod.yml ps` |
| `required variable ... is missing a value` al ejecutar `ps` o `logs` | Compose busca las variables en `.env`: crea el acceso directo `ln -sf .env.production .env` (o agrega `--env-file .env.production` a cada comando) |
