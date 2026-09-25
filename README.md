# Inspecciones de Emergencia

Aplicación web empresarial (responsive + PWA) para gestionar inspecciones de
extintores, botiquines, camillas y cualquier elemento de emergencia
configurable: inventario, inspecciones dinámicas, hallazgos, planes de acción,
evidencias, QR, indicadores y reportes.

- **Instalación en el servidor de la empresa (guía para TI): [`docs/INSTALACION.md`](docs/INSTALACION.md)**
- Pruebas locales, publicación en la nube y puesta en marcha: [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md)
- Arquitectura, modelo de datos, permisos y roadmap: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Stack: Next.js 16 · React 19 · TypeScript · Tailwind 4 · Prisma 7 · PostgreSQL 16 · Zod 4 · Vitest

## Estado

**Fase 1 — Fundación ✅**: autenticación (login, logout, sesiones revocables,
recuperación de contraseña, bloqueo por intentos, rate limiting), usuarios,
roles y permisos configurables, procesos, sedes y zonas, layout responsive
(sidebar en escritorio, barra inferior en móvil), manifest PWA, auditoría,
esquema de base de datos completo, seed de demostración y Docker.

**Fase 2 — Configuración ✅**: tipos de elemento configurables, editor de
preguntas dinámicas (9 tipos de respuesta, reglas de cumplimiento, orden,
activación, prioridad sugerida del hallazgo), inventario de elementos con
filtros por tipo/proceso/sede/estado/programación, alcance por proceso,
código sugerido, sede → área dependiente, cálculo centralizado de la próxima
inspección (🟢 al día · 🟡 próxima a vencer · 🔴 vencida) y ficha del elemento
con hallazgos abiertos e historial.

**Fase 3 — Inspecciones ✅**: elementos agrupados por **zonas** dentro de cada
sede; cualquier brigadista inspecciona cualquier zona. "Mis inspecciones" por
zona (vencidas / próximas), formulario dinámico para celular con botones grandes
y autoguardado, hallazgo en línea al responder "No cumple" (con plan de acción
inicial), fotos desde cámara o galería (comprimidas y validadas), finalización
con cálculo de cumplimiento y reprogramación automática, anulación e historial
filtrable.

**Vencimientos ✅**: una pregunta de fecha puede ser la *fecha de vencimiento*
del elemento (p.ej. recarga del extintor). Si la fecha ya pasó, la respuesta
no cumple y se propone un hallazgo **crítico**; además el elemento queda
marcado como **Vencido** y el Inicio muestra una **alerta crítica** aunque
nadie lo inspeccione. Aviso de "por vencer" 30 días antes.

**Fase 4 — Hallazgos y planes de acción ✅**: bandejas de hallazgos y planes
("Asignados a mí" / "Todos") con filtros y vencidos, flujo Pendiente → En
proceso → Solucionado → Verificado → Cerrado con permisos en el servidor,
evidencias (foto o PDF) obligatorias para solucionar, quien soluciona no puede
verificar, rechazo con motivo, reasignación, planes adicionales, historial y
cierre automático del hallazgo. **Vencimientos → hallazgo crítico + plan de
acción automático** asignado al responsable del elemento; al solucionarlo se
registra la nueva fecha de vencimiento.

**Fase 5 — Dashboard gerencial ✅**: cumplimiento del programa de inspecciones,
cumplimiento promedio, hallazgos abiertos y críticos, planes vencidos,
vencimientos expirados, tendencia mensual (inspecciones, cumplimiento,
hallazgos registrados vs. cerrados), hallazgos por prioridad, planes por estado
y cumplimiento por proceso y por sede, con filtros por periodo, proceso, sede,
tipo, responsable y estado. El seed incluye 12 meses de historial.

**Fase 7 — Notificaciones ✅**: campana 🔔 con contador (escritorio y móvil,
también en el ícono de la app instalada), bandeja `/notifications`, correo con
reintentos y preferencia por usuario. Avisos: plan asignado, devuelto,
solucionado (a verificadores), verificado/cerrado, hallazgo crítico (a gestores
del proceso), plan por vencer (3 días), plan vencido (semanal, al responsable y
gestores), elemento por vencer (30 y 7 días) y resumen diario de inspecciones
vencidas por zona.

**Flujo de revisión, usuarios y correos ✅**:
- **Revisión de inspecciones**: al finalizar, una inspección 100 % conforme se
  **archiva**; si tiene hallazgos pasa **En revisión** (las respuestas que no
  cumplen sin hallazgo descrito se registran solas). El brigadista solo
  describe el hallazgo; quien gestiona el proceso (menú **Revisión**) asigna
  la acción de mejora, el responsable y la fecha límite, o lo cierra como «no
  procede». Al terminar, la inspección queda **Revisada** y se notifica.
- **Usuarios**: eliminar (baja lógica si tiene historial; bloqueado si tiene
  planes abiertos) y **carga masiva** en la hoja *Usuarios* con correo de
  bienvenida para definir la contraseña.
- **Código del elemento SEDE-TIPO-ID, bloqueado**: al crear se escribe el **ID**
  (número del equipo; vacío = siguiente libre del tipo). El ID es único por
  tipo en **todas** las sedes: si ya existe, el formulario y el servidor lo
  rechazan indicando dónde está. El código no se edita (el servidor ignora
  cualquier código enviado). Si el
  elemento cambia de sede, zona o tipo se recodifica (PRO-EXT-023 →
  COM-EXT-023) conservando siempre su número (si ya existe, COM-EXT-023-2); el
  QR sigue funcionando. En la carga masiva, «Código» vacío =
  automático.
- **Correos** (*Administración → Correos*): diseño (empresa, colores, logo,
  pie) y plantillas HTML de notificaciones, bienvenida y restablecimiento, con
  variables, vista previa y envío de prueba.

**Carga masiva, reportes y QR ✅** (Fases 6 y 8):
- **Carga masiva** (*Configuración → Carga masiva*): plantilla Excel con listas
  desplegables y hojas **Sedes, Procesos, Tipos, Preguntas, Zonas y
  Elementos** (todas opcionales), vista previa con errores por fila y
  aplicación en una sola transacción (crea o actualiza por código). La hoja
  *Preguntas* define el cuestionario completo de cada tipo: Sí/No, Sí/No/No
  aplica, Número con mínimo/máximo, Fecha (incluida la de vencimiento),
  Selección con opciones que no cumplen, Texto y Foto.
- **Reportes** (*Reportes*): inspecciones, hallazgos, planes de acción,
  inventario y cumplimiento en PDF o Excel, con los mismos filtros del
  dashboard. Cada inspección tiene su **Informe PDF** (respuestas, hallazgos,
  fotos y firma) y cada elemento su historial en PDF/Excel.
- **QR**: etiquetas PDF (2×4 por hoja A4) por elemento, zona o todo el
  inventario; **Escanear** abre la cámara dentro de la app y muestra la ficha
  del elemento con el botón *Realizar inspección*. *Regenerar QR* invalida la
  etiqueta anterior.

## Requisitos

- Node.js ≥ 20.9 (recomendado 22)
- Docker (para PostgreSQL y Mailpit en local) o un PostgreSQL 14+ propio

## Puesta en marcha local

```bash
# 1. Dependencias (genera el cliente Prisma automáticamente)
npm install

# 2. Variables de entorno
cp .env.example .env

# 3. Servicios de apoyo: PostgreSQL :5432, Mailpit :1025/:8025
docker compose up -d

# 4. Base de datos: migraciones + seed (permisos, roles y cuenta de Super Administrador)
#    Para datos y usuarios de PRUEBA pon SEED_DEMO=true en .env antes del seed.
npm run db:deploy
npm run db:seed

# 5. Servidor de desarrollo
npm run dev
```

Abrir http://localhost:3000. Los correos (recuperación de contraseña,
invitaciones) se ven en Mailpit: http://localhost:8025. Si no usas Docker,
deja `SMTP_HOST=` vacío en `.env` y los correos se imprimen en la consola.

### Cuenta inicial y usuarios de prueba

Una instalación nueva queda **limpia**: solo la cuenta general de **Super
Administrador** (`SEED_ADMIN_EMAIL`, clave `SEED_DEFAULT_PASSWORD`, que se cambia
en el primer ingreso). Los usuarios y datos siguientes existen **solo en
desarrollo** con `SEED_DEMO=true` y se usan en las secciones «Cómo probar…».

Contraseña de todos: `Cambiar123*` (configurable con `SEED_DEFAULT_PASSWORD`).

| Correo | Rol |
|---|---|
| admin@inspecciones.local | Super administrador |
| inspector@inspecciones.local | Brigadista |
| responsable@inspecciones.local | Responsable de proceso + Responsable de acción (Producción) |
| accion@inspecciones.local | Responsable de acción |
| gerencia@inspecciones.local | Consulta / Gerencia |

El seed también crea 4 procesos, 2 sedes con 5 zonas, 3 tipos de elemento con
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
| `npm run db:seed` | Sincronizar permisos/roles, crear la cuenta de Super Administrador (y datos de prueba si `SEED_DEMO=true`) |
| `npm run db:reset` | Reiniciar la base de datos local (¡borra datos!) |
| `npm run db:studio` | Explorador de datos Prisma |

## Cómo probar la Fase 1

1. Ingresar como `admin@inspecciones.local`.
2. **Procesos** → Nuevo proceso (p. ej. `Logística`, código `log` → se guarda `LOG`).
   Intentar repetir el código: el sistema lo rechaza.
3. **Sedes y zonas** → Nueva sede → en la ficha, agregar zonas.
4. **Usuarios** → Nuevo usuario con rol Brigadista. Con contraseña temporal, el
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
   la frecuencia del tipo. Al elegir la sede se filtran sus zonas. Con última
   inspección `01/09/2026` y frecuencia mensual la vista previa muestra
   `01/10/2026`.
4. En el inventario filtra por **Programación: Vencida**; en **Inicio** los
   contadores 🟢🟡🔴 llevan al listado filtrado.
5. Abre `EXT-023`: hallazgo abierto e historial. Al editarlo, el tipo está
   bloqueado porque ya tiene inspecciones.
6. Ingresa como `responsable@inspecciones.local` (Producción): solo ve
   elementos de su proceso y no puede crear elementos; como
   `inspector@inspecciones.local` no accede a Tipos y preguntas.

## Cómo probar la Fase 3

1. Ingresa desde el celular (o con la vista móvil del navegador) como
   `inspector@inspecciones.local` → **Ir a mis inspecciones**.
2. Elige **Zona 1 – Bodega principal** → **Inspeccionar** en `EXT-023`.
3. Responde "¿Tiene acceso libre?" con **NO**: aparece el registro del hallazgo
   con prioridad, responsable y fecha límite sugeridos. Regístralo y agrégale
   una foto con **Tomar foto**.
4. Intenta **Finalizar** antes de terminar: el sistema indica las obligatorias
   pendientes. Responde el resto y finaliza: verás el resultado (%) y la
   próxima inspección del elemento.
5. Vencimientos: como administrador, el Inicio muestra la alerta crítica por
   `EXT-005` (recarga vencida). Al inspeccionarlo, ingresa una fecha de
   vencimiento pasada: se propone hallazgo crítico con límite de 1 día. Tras la
   recarga, actualiza la fecha en el inventario y la alerta desaparece.
6. Como `gerencia@inspecciones.local` revisa **Inspecciones → Historial**; como
   `responsable@inspecciones.local` (Producción) verás la inspección y las
   fotos de su proceso.

Fotos en local: se guardan en la carpeta `.storage/` (`STORAGE_DRIVER=local`).
En un servidor van al volumen `uploads` o a Amazon S3 / Cloudflare R2.

## Cómo probar la Fase 4

1. Arranca la app: en ~15 s el programador interno crea el **hallazgo crítico
   automático** de `EXT-005` (recarga vencida) y su plan, asignado a Juan.
2. Ingresa como `accion@inspecciones.local` (celular): **Planes** → plan de
   `EXT-005` → *Iniciar gestión* → adjunta foto y/o PDF → *Marcar como
   solucionado* con comentario y la **nueva fecha de vencimiento**.
3. Como `admin@inspecciones.local`: la alerta crítica del Inicio desapareció.
   Abre el plan → *Verificar* → *Cerrar*: el hallazgo queda cerrado.
4. Como `responsable@inspecciones.local`: soluciona el plan de `EXT-023`; verás
   que no puedes verificarlo tú mismo. El administrador puede *Devolver* con
   motivo y el plan vuelve a "En proceso".
5. Cron externo (opcional): `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run`.

## Cómo probar la Fase 5

1. Ingresa como `gerencia@inspecciones.local` → **Indicadores**.
2. Pasa el cursor (o toca en el celular) sobre las columnas y las líneas para
   ver los valores; abre **Ver tabla** en cualquier gráfico.
3. Usa los atajos de periodo y los filtros (p. ej. Proceso = Producción): todo
   el tablero se recalcula con el mismo corte.
4. Ingresa como `responsable@inspecciones.local`: solo verás su proceso.

## Cómo probar las notificaciones

1. Ejecuta las tareas programadas (o espera: corren cada hora):
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/run`.
2. Ingresa como `responsable@inspecciones.local`: la campana 🔔 muestra las no
   leídas (planes vencidos, alertas). Al abrir una, queda leída y te lleva al plan.
3. Los correos llegan a Mailpit (http://localhost:8025). En **Mi cuenta** puedes
   desactivarlos; la campana sigue funcionando.
4. Como `accion@inspecciones.local` marca un plan como solucionado: los
   verificadores del proceso reciben el aviso; al verificarlo, el responsable también.

## Cómo probar carga masiva, reportes y QR

1. Como `admin@inspecciones.local` → **Carga masiva** → *Descargar plantilla*.
   Llena las hojas *Zonas* y *Elementos* (las filas de ejemplo se ignoran),
   súbela, revisa la vista previa y pulsa *Aplicar*.
2. **Reportes** → elige periodo y filtros → *PDF* o *Excel*.
3. **Inventario** → *Etiquetas QR*, imprime y pega cada etiqueta en su elemento.
4. En el celular, como brigadista → **Escanear** → apunta al QR: se abre la
   ficha del elemento y puedes iniciar la inspección. Sin cámara, escribe el
   código del elemento.

## Entornos y despliegue

- **Servidor de la empresa**: [`docs/INSTALACION.md`](docs/INSTALACION.md) — Docker
  Compose con PostgreSQL, migraciones automáticas y tres opciones de HTTPS
  (certificado automático, certificado de la empresa o proxy existente),
  respaldos (`scripts/respaldo.sh`), restauración e instalación sin internet.
- **Paquete de entrega**: `sh scripts/empaquetar.sh` → `dist/inspecciones-emergencia-<versión>.zip`
  (código + configuración + documentación, sin secretos ni dependencias).
- `APP_ENV` (`development` | `staging` | `production`) define el entorno lógico;
  `NODE_ENV` lo gestiona Next (`production` en staging y producción).
- La app valida las variables al arrancar (`src/lib/env.ts`) y se niega a
  iniciar en producción con el `AUTH_SECRET` de ejemplo.
- En producción se exige HTTPS (la cookie de sesión es `__Host-session`, `Secure`).

## Problemas frecuentes

| Síntoma | Causa / solución |
|---|---|
| `Configuración de entorno inválida` al arrancar | Falta una variable en `.env` (ver `.env.example`) |
| `Cannot find module '@/generated/prisma/client'` | Ejecutar `npm run db:generate` |
| `P1001 Can't reach database server` | PostgreSQL no está arriba: `docker compose up -d` |
| Las fotos no suben | Revisa `STORAGE_DRIVER` (`local` o `s3`) y, con S3, las variables `S3_*` o el rol IAM. Máximo `UPLOAD_MAX_MB` por foto |
| No llegan correos | Revisar Mailpit (http://localhost:8025) o dejar `SMTP_HOST=` para verlos en consola |
| "Demasiados intentos" al iniciar sesión | Rate limit (5 intentos / 15 min por correo+IP). Reiniciar el servidor en desarrollo |
| Cuenta bloqueada | 10 intentos fallidos bloquean 15 min; un admin puede desbloquear desde la ficha del usuario |
| Warning `next start does not work with output: standalone` | Normal en local; en producción se usa `node server.js` (Dockerfile) |
