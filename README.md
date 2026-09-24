# Inspecciones de Emergencia

Aplicación web empresarial (responsive + PWA) para gestionar inspecciones de
extintores, botiquines, camillas y cualquier elemento de emergencia
configurable: inventario, inspecciones dinámicas, hallazgos, planes de acción,
evidencias, QR, indicadores y reportes.

- Arquitectura, modelo de datos, permisos y roadmap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Stack: Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 · PostgreSQL 16 · Zod 4 · Vitest

## Estado

**Fase 1 — Fundación ✅**: autenticación (login, logout, sesiones revocables,
recuperación de contraseña, bloqueo por intentos, rate limiting), usuarios,
roles y permisos configurables, procesos, sedes y áreas, layout responsive
(sidebar en escritorio, barra inferior en móvil), manifest PWA, auditoría,
esquema de base de datos completo, seed de demostración y Docker.

**Fase 2 — Configuración ✅**: tipos de elemento configurables, editor de
preguntas dinámicas (9 tipos de respuesta, reglas de cumplimiento, orden,
activación, prioridad sugerida del hallazgo), inventario de elementos con
filtros por tipo/proceso/sede/estado/programación, alcance por proceso,
código sugerido, sede → área dependiente, cálculo centralizado de la próxima
inspección (🟢 al día · 🟡 próxima a vencer · 🔴 vencida) y ficha del elemento
con hallazgos abiertos e historial.

## Requisitos

- Node.js ≥ 20.9 (recomendado 22)
- Docker (para PostgreSQL, MinIO y Mailpit en local) o un PostgreSQL 14+ propio

## Puesta en marcha local

```bash
# 1. Dependencias (genera el cliente Prisma automáticamente)
npm install

# 2. Variables de entorno
cp .env.example .env

# 3. Servicios de apoyo: PostgreSQL :5432, MinIO :9000/:9001, Mailpit :1025/:8025
docker compose up -d

# 4. Base de datos: migraciones + seed (catálogo de permisos y datos de prueba)
npm run db:deploy
npm run db:seed

# 5. Servidor de desarrollo
npm run dev
```

Abrir http://localhost:3000. Los correos (recuperación de contraseña,
invitaciones) se ven en Mailpit: http://localhost:8025. Si no usas Docker,
deja `SMTP_HOST=` vacío en `.env` y los correos se imprimen en la consola.

### Usuarios de prueba

Contraseña de todos: `Cambiar123*` (configurable con `SEED_DEFAULT_PASSWORD`).

| Correo | Rol |
|---|---|
| admin@inspecciones.local | Administrador |
| inspector@inspecciones.local | Inspector |
| responsable@inspecciones.local | Responsable de proceso + Responsable de acción (Producción) |
| accion@inspecciones.local | Responsable de acción |
| gerencia@inspecciones.local | Consulta / Gerencia |

El seed también crea 4 procesos, 2 sedes con áreas, 3 tipos de elemento con
sus preguntas, 11 elementos (incluido `EXT-023`), inspecciones, hallazgos y
planes de acción para probar las fases siguientes.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Compilación y servidor de producción |
| `npm run typecheck` | Tipos (incluye tipos de rutas de Next) |
| `npm run lint` | ESLint |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run db:migrate` | Crear/aplicar migraciones en desarrollo |
| `npm run db:deploy` | Aplicar migraciones (staging/producción) |
| `npm run db:seed` | Sincronizar permisos/roles y cargar datos de demostración |
| `npm run db:reset` | Reiniciar la base de datos local (¡borra datos!) |
| `npm run db:studio` | Explorador de datos Prisma |

## Cómo probar la Fase 1

1. Ingresar como `admin@inspecciones.local`.
2. **Procesos** → Nuevo proceso (p. ej. `Logística`, código `log` → se guarda `LOG`).
   Intentar repetir el código: el sistema lo rechaza.
3. **Sedes y áreas** → Nueva sede → en la ficha, agregar áreas.
4. **Usuarios** → Nuevo usuario con rol Inspector. Con contraseña temporal, el
   usuario verá un aviso para cambiarla; sin contraseña, recibe un correo de
   invitación (Mailpit).
5. **Roles y permisos** → editar "Consulta / Gerencia" y quitar un permiso.
6. Cerrar sesión e ingresar con el usuario nuevo: no ve el menú de
   administración y si abre `/admin/users` directamente es redirigido a
   *Sin permiso* (validación en servidor).
7. **Mi cuenta** → cambiar contraseña (cierra las demás sesiones).
8. "¿Olvidaste tu contraseña?" → revisar el correo en Mailpit y restablecerla.
9. Revisar la auditoría: `select action, "entityType", after from audit_logs order by id desc;`

## Cómo probar la Fase 2

1. Como administrador: **Tipos y preguntas** → Nuevo tipo (p. ej. `Lavaojos`,
   prefijo `LAV`). Se abre el editor de preguntas.
2. Agrega preguntas de distintos tipos: Sí/No; Sí/No con «¿Qué respuesta NO
   cumple?» = Sí (pregunta negativa); Selección con opciones y marcando las que
   no cumplen; Número con rango. Reordénalas con las flechas, edita y elimina.
3. **Inventario** → Nuevo elemento → elige `Lavaojos`: se sugiere `LAV-001` y
   la frecuencia del tipo. Al elegir la sede se filtran sus áreas. Con última
   inspección `01/09/2026` y frecuencia mensual la vista previa muestra
   `01/10/2026`.
4. En el inventario filtra por **Programación: Vencida**; en **Inicio** los
   contadores 🟢🟡🔴 llevan al listado filtrado.
5. Abre `EXT-023`: hallazgo abierto e historial. Al editarlo, el tipo está
   bloqueado porque ya tiene inspecciones.
6. Ingresa como `responsable@inspecciones.local` (Producción): solo ve
   elementos de su proceso y no puede crear elementos; como
   `inspector@inspecciones.local` no accede a Tipos y preguntas.

## Entornos y despliegue

- `APP_ENV` (`development` | `staging` | `production`) define el entorno lógico;
  `NODE_ENV` lo gestiona Next (`production` en staging y producción).
- La app valida las variables al arrancar (`src/lib/env.ts`) y se niega a
  iniciar en producción con el `AUTH_SECRET` de ejemplo.

```bash
# Imagen de la aplicación (Next standalone, usuario no root, healthcheck)
docker build -t inspecciones:latest .
# Imagen del job de migraciones + sincronización de permisos
docker build --target migrate -t inspecciones-migrate:latest .

# Todo en un host (ejemplo): postgres + migrate + app
cp .env.example .env.production   # completar valores reales
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

En producción: usar HTTPS (la cookie de sesión es `__Host-session`, `Secure`),
PostgreSQL gestionado con backups, y un bucket S3/R2 privado.

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `Configuración de entorno inválida` al arrancar | Falta una variable en `.env` (ver `.env.example`) |
| `Cannot find module '@/generated/prisma/client'` | Ejecutar `npm run db:generate` |
| `P1001 Can't reach database server` | PostgreSQL no está arriba: `docker compose up -d` |
| No llegan correos | Revisar Mailpit (http://localhost:8025) o dejar `SMTP_HOST=` para verlos en consola |
| "Demasiados intentos" al iniciar sesión | Rate limit (5 intentos / 15 min por correo+IP). Reiniciar el servidor en desarrollo |
| Cuenta bloqueada | 10 intentos fallidos bloquean 15 min; un admin puede desbloquear desde la ficha del usuario |
| Warning `next start does not work with output: standalone` | Normal en local; en producción se usa `node server.js` (Dockerfile) |
