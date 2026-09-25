# Arquitectura — Sistema de Inspecciones de Emergencia

> Documento vivo. Describe las decisiones de arquitectura y el plan por fases.
> Última actualización: Fase 7 (notificaciones). Guía de implementación: [`DESPLIEGUE.md`](DESPLIEGUE.md).

---

## A. Arquitectura propuesta

**Monolito modular** con Next.js (App Router) sirviendo UI y backend en un
solo despliegue, con capas internas bien separadas para poder extraer
servicios más adelante si el volumen lo exige.

```
┌──────────────────────────── Navegador / PWA (móvil, tablet, PC) ─────────────────────────────┐
│  React Server Components (lectura)   ·   Client Components (formularios, cámara, QR)         │
└───────────────┬──────────────────────────────────────┬───────────────────────────────────────┘
                │ HTML/RSC                              │ Server Actions (mutaciones)  /  Route Handlers (/api/*)
┌───────────────▼──────────────────────────────────────▼───────────────────────────────────────┐
│  src/app            Páginas y layouts. Solo orquestan: guardas de permisos + llamadas a servicios │
│  src/server/actions Server Actions: autenticación → validación Zod → servicio → revalidación      │
│  src/server/services Lógica de negocio + autorización por alcance + transacciones + auditoría      │
│  src/server/auth    Sesiones, contraseñas, rate limit, usuario actual y permisos                   │
│  src/lib            Código puro compartido: permisos, programación, validaciones, utilidades       │
└───────────────┬────────────────────────────┬─────────────────────────┬───────────────────────┘
                │ Prisma (driver adapter pg)  │ S3 API (URLs firmadas)   │ SMTP / canales
          ┌─────▼─────┐                 ┌─────▼─────┐             ┌──────▼──────┐
          │PostgreSQL │                 │ S3 / R2 / │             │ Correo, luego│
          │           │                 │  o disco  │             │ WhatsApp/SMS │
          └───────────┘                 └───────────┘             └─────────────┘
```

Reglas de dependencia:

- `app` → `server/actions` → `server/services` → `server/db`. Nunca al revés.
- Los **servicios** son la única capa que habla con la base de datos para
  escribir. Reciben un `ServiceContext` (usuario + IP/UA) y registran auditoría
  en la misma transacción.
- `src/lib` no importa nada del servidor: se puede usar en cliente, servidor,
  seed y tests.
- Todo módulo de servidor importa `server-only`, así un import accidental desde
  el cliente rompe el build en lugar de filtrar código o secretos.

### ¿Por qué Next.js (Server Actions + Route Handlers) y no NestJS?

| Criterio | Next.js monolito | Next.js + NestJS |
|---|---|---|
| Despliegue | 1 contenedor | 2 servicios + contrato API |
| Tipos extremo a extremo | Directos (mismo proyecto) | Requiere compartir DTOs / OpenAPI |
| Velocidad de desarrollo MVP | Alta | Media |
| Integraciones externas futuras | Route Handlers `/api/v1/*` | Nativo |
| Escalabilidad | Horizontal (stateless) | Horizontal |

Para un MVP empresarial con un solo frontend, NestJS agrega complejidad sin
beneficio inmediato. La capa `server/services` es independiente de Next (no
usa `cookies()` ni `headers()`), por lo que puede moverse a NestJS o a un
worker si en el futuro aparece una app nativa o integraciones pesadas.

---

## B. Stack definitivo

| Capa | Tecnología | Motivo |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack, `output: standalone`) | UI + backend en un despliegue, RSC para listados rápidos |
| UI | **React 19.2**, **TypeScript** estricto | Tipado fuerte, `useActionState`, `useEffectEvent` |
| Estilos | **Tailwind CSS 4** con tokens semánticos | Consistencia y mobile-first |
| Componentes | Propios (`src/components/ui`) + `lucide-react` + `sonner` (toasts) | Sin dependencias pesadas; accesibles (ARIA, `<dialog>` nativo) |
| Validación | **Zod 4** (esquemas compartidos cliente/servidor, mensajes en español) | Una sola fuente de verdad |
| ORM | **Prisma 7** + `@prisma/adapter-pg` | Migraciones versionadas, consultas tipadas y parametrizadas |
| BD | **PostgreSQL 16** | Relacional, JSONB para respuestas dinámicas |
| Auth | Sesiones propias en BD + bcrypt | Revocables, sin dependencias externas, control total |
| Archivos | Disco/volumen o API S3 (`@aws-sdk/client-s3`) servidos a través de la app | Volumen local, AWS S3 o Cloudflare R2 sin cambiar código |
| Correo | Nodemailer (SMTP) · Mailpit en local | Cualquier proveedor SMTP |
| Pruebas | **Vitest** (unitarias), **Playwright** (E2E) | Rápidas; Chromium ya disponible |
| Infra | Docker multi-etapa, docker compose, variables de entorno | development / staging / production |

---

## C. Estructura de carpetas

```
.
├── prisma/
│   ├── schema.prisma          Modelo de datos completo
│   ├── migrations/            Migraciones SQL versionadas
│   └── seed.ts                Catálogo de permisos/roles + datos de demostración
├── prisma.config.ts           Configuración Prisma 7 (URL, seed)
├── public/icons/              Íconos PWA
├── src/
│   ├── app/
│   │   ├── (auth)/            login, forgot-password, reset-password (sin sesión)
│   │   ├── (app)/             Área autenticada con AppShell
│   │   │   ├── dashboard/
│   │   │   ├── admin/{users,roles,processes,sites}/
│   │   │   ├── profile/  forbidden/
│   │   │   └── (fases siguientes) inventory/, inspections/, findings/, action-plans/, reports/
│   │   ├── api/health/        Health check
│   │   ├── manifest.ts        Web App Manifest (PWA)
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                Primitivos reutilizables (Button, Input, DataList, ConfirmButton…)
│   │   ├── layout/            AppShell y navegación filtrada por permisos
│   │   └── forms/             Formularios de dominio (cliente)
│   ├── emails/                Plantillas de correo (HTML + texto)
│   ├── hooks/                 useActionForm (toasts, errores de campo, navegación)
│   ├── lib/                   Código puro: permissions, scheduling, validation/*, utils
│   ├── server/
│   │   ├── auth/              session, password, tokens, rate-limit, current-user
│   │   ├── actions/           Server Actions ("use server")
│   │   ├── services/          Lógica de negocio por módulo
│   │   ├── mail/              Envío de correo
│   │   ├── audit.ts  db.ts  errors.ts  request-context.ts
│   ├── generated/prisma/      Cliente Prisma generado (no versionado)
│   └── proxy.ts               Redirección optimista a /login (Next 16: antes "middleware")
├── tests/unit/                Vitest
├── docs/                      Documentación
├── Dockerfile  docker-compose.yml  docker-compose.prod.yml
└── .env.example
```

---

## D. Modelo de datos

Ver `prisma/schema.prisma` (comentado). Resumen de entidades y relaciones:

```
Role ──< RolePermission >── Permission
 │
UserRole                    UserProcess >── Process ──< Element >── ElementType ──< InspectionTemplate ──< InspectionQuestion
 │                              │                        │  │  │                         │                        │
User ──────────────────────────┘                         │  │  └── Site ──< Zone         │                        │
 │  ├──< Session, PasswordResetToken                     │  └──< Inspection >───────────┘                        │
 │  ├──< Notification ──< NotificationDelivery (canal)   │         └──< InspectionAnswer >──────────────────────┘
 │  └──< AuditLog                                        │                   │
 │                                                       └──< Finding >──────┘ (answer / question opcionales)
 │                                                               └──< ActionPlan ──< ActionPlanEvent
 └── Evidence (FKs opcionales a Element | Inspection | InspectionAnswer | Finding | ActionPlan)
```

Cardinalidades clave:

| Relación | Cardinalidad | Nota |
|---|---|---|
| User ↔ Role | N:M (`user_roles`) | Permisos efectivos = unión de roles |
| User ↔ Process | N:M (`user_processes`) | Define el alcance `*.read.process` |
| Site → Zone | 1:N | `@@unique([siteId, code])`. Zona = agrupación física que recorren los brigadistas |
| ElementType → InspectionTemplate | 1:N (versionado) | Una plantilla `PUBLISHED` activa por tipo |
| Template → Question | 1:N | Ordenadas por `order`; tipo de respuesta configurable |
| Element → Inspection | 1:N | La inspección guarda `processId/siteId` como *snapshot* |
| Inspection → Answer | 1:N | `@@unique([inspectionId, questionId])`; guarda texto/tipo de la pregunta |
| Inspection/Answer → Finding | 1:N | Un hallazgo puede crearse también sin inspección (manual) |
| Finding → ActionPlan | 1:N | Varios planes por hallazgo |
| ActionPlan → ActionPlanEvent | 1:N | Línea de tiempo de estados y observaciones |
| Notification → Delivery | 1:N | Una entrega por canal (outbox) |

Decisiones del modelo:

- **IDs `cuid`** (no secuenciales, no enumerables). Además `number`
  autoincremental en inspecciones, hallazgos y planes (#000125) para
  referencia humana.
- **Snapshots**: `InspectionAnswer` guarda texto, tipo y orden de la pregunta;
  `Inspection` guarda proceso y sede. Editar preguntas o trasladar un elemento
  no altera el historial ni los indicadores pasados.
- **Respuestas dinámicas** en `value Json` + `isCompliant Boolean?`
  precalculado → los indicadores se calculan con SQL simple e índices.
- **Regla de cumplimiento configurable** por pregunta (`complianceRule`), p.ej.
  en "¿Tiene elementos faltantes?" el valor no conforme es `SÍ`.
- **Borrado lógico**: `deletedAt` + `active` en datos maestros; `onDelete:
  Restrict` en todo lo que tiene historial. Inspecciones, hallazgos, planes y
  auditoría no se borran: cambian de estado.
- **Índices** en las columnas de filtros del dashboard (proceso, sede, estado,
  fechas, responsable) y en claves foráneas.
- **Evidencias**: FKs opcionales explícitas (no polimorfismo por texto) para
  conservar integridad referencial.
- **QR**: `Element.qrToken` aleatorio y único, independiente del ID y del código.
- **Programación persistida**: `nextInspectionAt` y `dueSoonAt` se calculan
  siempre con `scheduleFields()` (`src/lib/scheduling.ts`). Así los filtros
  🟢/🟡/🔴 son condiciones SQL simples e indexadas (`scheduleWhere()` en
  `elements.service.ts`) y un test garantiza que coinciden con `scheduleStatus()`.

---

## E. Roles y permisos

Autorización **basada en permisos** (no en nombres de rol). Los roles son
configurables desde la UI; el catálogo de permisos vive en
`src/lib/permissions.ts` y se sincroniza a la BD con el seed.

Tres niveles de control, todos en el servidor:

1. **Acceso a página**: `requirePagePermission(...)` (redirige a `/forbidden`).
2. **Acción**: `requirePermission(...)` en cada Server Action.
3. **Alcance de datos**: `readScope()` → `all | process | own | assigned`,
   traducido a filtros `WHERE` en los servicios (Fases 2–4).

La navegación se filtra por permisos solo como ayuda visual.

| Permiso | Admin | Inspector | Resp. proceso | Resp. acción | Gerencia |
|---|:-:|:-:|:-:|:-:|:-:|
| users.read / users.manage | ✔ | | | | |
| roles.manage · processes.manage · sites.manage · settings.manage · audit.read | ✔ | | | | |
| element_types.manage (tipos, plantillas, preguntas) | ✔ | | | | |
| elements.read | all | all | process | | all |
| elements.manage | ✔ | | | | |
| inspections.read | all | own | process | | all |
| inspections.perform | ✔ | ✔ | | | |
| findings.read | all | assigned | process | assigned | all |
| findings.create | ✔ | ✔ | | | |
| findings.manage · findings.verify | ✔ | | ✔ | | |
| findings.close | ✔ | | | | |
| actions.read | all | | process | assigned | all |
| actions.manage | ✔ | | ✔ | | |
| actions.update (avance de lo asignado) | ✔ | | ✔ | ✔ | |
| actions.verify | ✔ | | ✔ | | |
| actions.close | ✔ | | | | |
| evidences.upload | ✔ | ✔ | ✔ | ✔ | |
| dashboard.view · reports.view | ✔ | | ✔ | | ✔ |
| reports.export | ✔ | | | | ✔ |

Reglas adicionales:

- El rol **ADMIN** siempre conserva todos los permisos y no se puede desactivar.
- Siempre debe quedar **al menos un administrador activo**.
- **Segregación de funciones** (Fase 4): quien marca un plan como
  *Solucionado* no puede verificarlo.

---

## F. Flujo principal

```
Elemento ──► Inspección ──► Respuesta ──► Hallazgo ──► Plan de acción ──► Evidencia ──► Verificación ──► Cierre
 (QR/lista)   (plantilla     (no cumple    (prioridad,   (responsable,     (foto/PDF)    (usuario con     (usuario con
              publicada)      → propone)    responsable)  fecha límite)                    *.verify)        *.close)
```

1. **Elemento**: el inspector lo abre desde "Mis inspecciones" o escaneando su
   QR (`/q/{qrToken}`).
2. **Inspección**: se crea `IN_PROGRESS` con la plantilla publicada del tipo;
   las preguntas se renderizan dinámicamente según `responseType`.
3. **Respuesta**: cada respuesta se guarda al momento (autoguardado) y se
   evalúa con la regla de cumplimiento.
4. **Hallazgo**: una respuesta no conforme en una pregunta con
   `generatesFinding` abre inmediatamente el formulario de hallazgo con la
   prioridad por defecto de la pregunta.
5. **Finalizar**: valida obligatorias, calcula `compliancePct` y resultado,
   actualiza `lastInspectionAt/nextInspectionAt` del elemento
   (`src/lib/scheduling.ts`) y notifica a responsables.
6. **Plan de acción**: `PENDIENTE → EN PROCESO → SOLUCIONADO → VERIFICADO → CERRADO`.
   Cada transición la valida una máquina de estados en el servicio (permiso +
   estado de origen) y queda en `ActionPlanEvent` y en auditoría. Verificar puede
   devolver a *En proceso* con observación.
7. **Hallazgo** pasa a *Cerrado* cuando todos sus planes están cerrados.

---

## G. Roadmap

| Fase | Alcance | Estado |
|---|---|---|
| 1 Fundación | Proyecto, Prisma + esquema completo, auth (login/logout/sesiones/recuperación), usuarios, roles/permisos, procesos, sedes/zonas, layout responsive, PWA manifest, auditoría base, Docker, seed | ✅ |
| 2 Configuración | Tipos de elemento, plantillas y preguntas dinámicas (orden, tipos, reglas), inventario de elementos, programación | ✅ |
| 3 Inspecciones | Mis inspecciones por zona, formulario dinámico móvil, autoguardado, hallazgos en línea, fotos (S3), finalización, resultado y reprogramación | ✅ |
| 4 Hallazgos | Hallazgos, planes de acción, máquina de estados, evidencias, verificación y cierre, hallazgos automáticos por vencimiento | ✅ |
| 5 Dashboard | Indicadores, gráficos, filtros por fecha/proceso/sede/tipo/responsable/estado | ✅ |
| 6 QR | Generación (PDF de etiquetas), lectura con cámara, apertura directa | ✅ |
| 7 Notificaciones | In-app, correo, recordatorios, inspecciones vencidas y vencimientos de elementos (job programado) | ✅ |
| 8 Reportes | Reportes filtrables, exportación Excel y PDF, informe por inspección, carga masiva de inventario | ✅ |
| 9 Endurecimiento | Visor de auditoría, E2E, rate limit distribuido, optimización, checklist de producción | |

---

## H. Decisiones técnicas

| Decisión | Alternativas | Razón |
|---|---|---|
| Sesiones en BD con token opaco (hash SHA-256 en BD) | JWT, Auth.js | Revocación inmediata (desactivar usuario, cambio de contraseña), sin secretos en el token |
| Expiración por inactividad (12 h) + absoluta (7 días) | Solo una | Equilibrio uso en campo / seguridad |
| bcrypt coste 12 (bcryptjs, JS puro) | argon2 nativo | Sin binarios nativos en Alpine; seguro y probado |
| Server Actions para mutaciones | API REST para todo | Protección CSRF integrada (verificación de Origin), menos código; `/api/v1` para integraciones |
| Esquema completo en Fase 1 | Crecer tabla a tabla | Evita reestructuraciones y migraciones destructivas; las fases solo agregan lógica |
| Plantillas versionadas + snapshots | Editar preguntas "en caliente" | Historial inmutable y auditable |
| Programación en `src/lib/scheduling.ts` (función pura) | Cálculos en cada pantalla | Una sola fuente de verdad, probada con tests |
| Notificaciones con outbox (`NotificationDelivery` por canal) | Envío directo | Reintentos, trazabilidad y nuevos canales sin tocar el dominio |
| Archivos con URL firmada directa al bucket | Subir a través del servidor | No satura el servidor; límite de tamaño y MIME validados al firmar y al confirmar |
| Proxy solo optimista | Autorización en el proxy | Recomendación de Next 16: la seguridad real va junto a los datos |
| `output: standalone` | Imagen con node_modules completo | Imagen pequeña; migraciones en un job aparte (`--target migrate`) |

---

## I. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Conectividad deficiente en campo | Inspecciones perdidas | Autoguardado por respuesta (Fase 3); arquitectura offline preparada (ver abajo) |
| Cambios en preguntas alteran el historial | Datos no confiables | Snapshots + versionado de plantillas |
| Fuga de permisos (solo UI) | Acceso indebido | Guardas en página, acción y alcance de consulta; tests de permisos |
| Fotos pesadas desde celulares | Lentitud y costos | Compresión en cliente, límite `UPLOAD_MAX_MB`, subida directa firmada |
| Rate limit en memoria con varias réplicas | Protección parcial | Interfaz `RateLimiter` lista para Redis/Upstash (Fase 9) |
| Inconsistencia de fechas por zona horaria | Vencimientos erróneos | UTC en BD, `APP_TIMEZONE` (America/Bogota) al mostrar, lógica centralizada |
| Crecimiento de `audit_logs` | Rendimiento | Índices por entidad/fecha; particionado o archivado por año cuando aplique |
| Breaking changes de Next 16 / Prisma 7 | Errores de integración | Versiones fijadas, typecheck + build + E2E en cada fase |

---

## Preguntas dinámicas y reglas de cumplimiento (Fase 2)

Todo el comportamiento de una pregunta vive en datos, no en código:

| Tipo | Valor guardado | Regla configurable (`complianceRule`) | ¿Evaluable? |
|---|---|---|---|
| Sí / No | `"YES"` \| `"NO"` | Qué respuesta no cumple (por defecto `NO`; `SÍ` para preguntas negativas) | Sí |
| Sí / No / No aplica | `"YES"` \| `"NO"` \| `"NA"` | Igual; `NA` no cuenta para el cumplimiento | Sí |
| Cumple / No cumple | `"COMPLIES"` \| `"NOT_COMPLIES"` | — | Sí |
| Número | `number` | Rango `min` / `max` | Si hay rango |
| Fecha | `"YYYY-MM-DD"` | `dateNotPast`: no cumple si ya pasó | Si se activa |
| Selección / múltiple | `string` / `string[]` | Opciones que no cumplen | Si se marcan |
| Texto / Fotografía | `string` / evidencia | — | No |

`src/lib/inspection-rules.ts` concentra `normalizeAnswerValue()` (valida el
valor recibido), `evaluateCompliance()` (cumple / no cumple / no evaluable) y
`describeRule()`; lo usan el editor de preguntas, el formulario de inspección
(Fase 3), los reportes y las pruebas. Solo las preguntas evaluables pueden
proponer hallazgos.

Edición segura: una pregunta con respuestas no puede cambiar de tipo (se
desactiva y se crea otra); eliminar es borrado lógico; el orden se cambia con
botones subir/bajar (accesibles y usables en móvil).

## Zonas y ejecución de inspecciones (Fase 3)

- Cada sede se divide en **zonas** (Zona 1, Zona 2…); cada elemento pertenece a
  una zona. No hay asignación individual: **cualquier brigadista** (rol
  `INSPECTOR`, permiso `inspections.perform`) puede inspeccionar cualquier zona.
- "Mis inspecciones": inspecciones en curso del brigadista + tarjetas de zona
  con vencidas / próximas a vencer (misma lógica central de programación). Los
  elementos activos sin zona aparecen en "Sin zona asignada" por sede.
- Inicio: crea la inspección `IN_PROGRESS` con la plantilla publicada; si el
  brigadista ya tiene una en curso para ese elemento, la retoma. Dos
  brigadistas pueden inspeccionar el mismo elemento (se muestra "En curso
  por…"): así una inspección abandonada nunca bloquea el elemento.
- Autoguardado por respuesta (`saveAnswer`): el servidor valida el valor,
  evalúa el cumplimiento y guarda la copia de la pregunta.
- "No cumple" + `generatesFinding` → panel de hallazgo en línea con prioridad
  sugerida por la pregunta, responsable sugerido (responsable del elemento) y
  fecha límite según prioridad (crítica 1 día, alta 7, media 15, baja 30). Al
  registrarlo se crea también el **primer plan de acción** (pendiente).
- Finalizar: exige las obligatorias (en preguntas de foto, al menos una foto),
  advierte no conformidades sin hallazgo, calcula % y resultado
  (`computeInspectionResult`) y reprograma el elemento con `scheduleFields()`
  en la misma transacción.
- Anular: solo en curso y sin hallazgos. Mientras la inspección no se
  finaliza, sus hallazgos son borradores que el brigadista puede eliminar.

## Vencimientos de elementos (recarga de extintores, caducidades)

- Una pregunta de tipo **Fecha** puede marcarse como *"Es la fecha de
  vencimiento del elemento"* (`tracksExpiry`). Siempre aplica la regla "no
  cumple si ya pasó" y su prioridad sugerida (p.ej. Crítica) se usa para el
  hallazgo.
- Al finalizar la inspección, esa fecha se copia al elemento
  (`Element.expiresAt` + concepto, p.ej. "Recarga"). También se puede cargar
  o actualizar a mano en el inventario (útil tras una recarga).
- Estado único (`src/lib/expiry.ts`): **Vencido** (la fecha ya pasó → alerta
  crítica), **Por vencer** (30 días), **Vigente**. `expiryRange()` traduce el
  estado a SQL y un test garantiza que ambos coinciden.
- La alerta no depende de que alguien inspeccione: el Inicio muestra
  "ALERTA CRÍTICA" con el número de elementos vencidos, el inventario permite
  filtrar por vencimiento y las zonas del brigadista marcan los elementos
  vencidos. En la Fase 7 el mismo cálculo alimenta notificaciones y correos.

## Hallazgos y planes de acción (Fase 4)

- **Máquina de estados** en `src/lib/workflow.ts` (pura, con pruebas):
  Pendiente → En proceso → Solucionado → Verificado → Cerrado; "Rechazar"
  devuelve de Solucionado a En proceso.
  - Iniciar / solucionar: el responsable del plan (`actions.update`) o quien
    gestiona planes en su alcance (`actions.manage`).
  - Solucionar exige comentario y al menos una evidencia (foto o PDF).
  - Verificar / rechazar: `actions.verify` y **no** haber solucionado ese plan
    (segregación de funciones, se guarda `solvedById`). Rechazar exige motivo.
  - Cerrar: `actions.close`, solo planes verificados.
- El **estado del hallazgo se deriva** de sus planes (`deriveFindingStatus`):
  se cierra solo cuando todos sus planes están cerrados.
- Bandejas con alcance aplicado en la consulta: planes "Asignados a mí" /
  "Todos", filtros por estado, prioridad y vencidos; hallazgos por estado,
  prioridad, origen, proceso y sede.
- Gestión (`actions.manage`): agregar planes a un hallazgo, reasignar
  responsable, cambiar acción o fecha límite (queda en el historial y se
  notifica al nuevo responsable).
- Cada cambio queda en `action_plan_events` (línea de tiempo) y en auditoría.

## Hallazgos automáticos por vencimiento

- Tarea programada `generateExpiryFindings()`: por cada elemento activo con
  vencimiento expirado crea un hallazgo **crítico** (origen `EXPIRY`) y su plan
  de acción con límite de 1 día, asignado al **responsable del elemento**
  (si no hay: un gestor de planes del proceso; si no, un administrador), y le
  notifica.
- Idempotente: no crea otro si ya hay un hallazgo abierto por vencimiento
  (automático o de inspección) y usa `dedupeKey` único por elemento + fecha.
- Ejecución: programador interno al iniciar y cada hora
  (`INTERNAL_SCHEDULER=true`, `src/instrumentation.ts`) y/o cron externo
  `POST /api/cron/run` con `Authorization: Bearer CRON_SECRET` (recomendado con
  varias réplicas).
- Al marcar como solucionado un plan de vencimiento se exige la **nueva fecha
  de vencimiento**, que se guarda en el elemento y apaga la alerta.

## Dashboard gerencial (Fase 5)

- Ruta `/indicators` (permiso `dashboard.view`). Gerencia ve todo; el
  responsable de proceso ve solo sus procesos (el alcance se aplica en las
  consultas, también en las opciones de los filtros).
- **Filtros en una fila** sobre todo el tablero (formulario GET, URL
  compartible): periodo (atajos: este mes, 90 días, este año, 12 meses) +
  proceso, sede, tipo de elemento, responsable y estado. Todos los números de
  la página usan el mismo corte.
- **Fórmulas** (`src/lib/indicators.ts`, con pruebas):
  - Cumplimiento del programa = realizadas ÷ (realizadas + pendientes + vencidas)
    (ej. 180/15/5 → 90 %). Pendientes y vencidas son el estado actual.
  - Cumplimiento promedio = promedio del % de las inspecciones del periodo.
  - Inspecciones sin novedad = % con resultado "Cumple".
  - Por proceso / sede se usa el proceso y la sede guardados en la inspección
    (snapshot), así el histórico no cambia si un elemento se traslada.
- **Gráficos** propios en SVG (sin librerías): una métrica por gráfico (nunca
  doble eje), marcas delgadas, rejilla hairline, tooltip al pasar o tocar,
  navegación con teclado, "Ver tabla" en cada gráfico y paleta validada para
  daltonismo. Las barras enlazan al listado filtrado.
- Escala: las series se agregan en el servidor a partir de las filas del
  periodo; suficiente para decenas de miles de inspecciones al año. Si crece
  más, se reemplaza por agregaciones SQL (`date_trunc`) o vistas materializadas
  sin cambiar la interfaz del servicio.

## QR, reportes y carga masiva (Fases 6 y 8)

- **QR**: cada elemento tiene un `qrToken` opaco; la etiqueta codifica
  `${APP_URL}/q/<token>` (no expone ids ni datos). `/q/[token]` exige sesión y
  muestra la ficha con *Realizar inspección*. *Regenerar QR* cambia el token y
  deja inválida la etiqueta anterior. Etiquetas en PDF vectorial (`qrcode` +
  `pdf-lib`, máx. 500 por archivo).
- **Escáner** (`/scan`, `src/components/qr/qr-scanner.tsx`): cámara trasera con
  `BarcodeDetector`, o `jsqr` cargado bajo demanda (iPhone). Solo acepta rutas
  `/q/<token>` del mismo origen; alternativa manual por código.
- **Reportes**: los servicios construyen un `TableReport` neutro
  (`src/server/reports/types.ts`) que se renderiza a PDF (`pdf-lib`, columnas
  con ajuste automático de ancho) o Excel (`exceljs`). Permiso
  `reports.export`; el alcance por proceso se aplica igual que en el
  dashboard.
- **Catálogo en la carga masiva** (`import-catalog.ts`): hojas opcionales
  Sedes, Procesos, Tipos y Preguntas, aplicadas antes de Zonas y Elementos en
  la misma transacción. Lo nuevo recibe un ID virtual (`new:<tipo>:<código>`)
  que se traduce al real al aplicar. Cada fila de *Preguntas* pasa por
  `questionRowToForm` (`src/lib/import-questions.ts`) y luego por el mismo
  `questionSchema` del editor; para cada tipo presente el archivo define el
  cuestionario completo (coincidencia por texto; las que faltan se desactivan,
  no se borran; no se cambia el tipo de respuesta de una pregunta ya
  respondida). Permisos: `sites.manage`, `processes.manage`,
  `element_types.manage` según las hojas usadas.
- **Carga masiva** (`import.service.ts`): plantilla con validaciones de datos,
  `analyzeImport` (vista previa: crear/actualizar/error por fila) y
  `applyImport` (una transacción, zonas primero, `scheduleFields`, auditoría
  `import.inventory`). Límites: 5 MB y 5000 filas; permiso `elements.manage`.

## Revisión de inspecciones (aprobación)

- `Inspection.reviewStatus`: `ARCHIVED` (sin hallazgos), `PENDING_REVIEW` y
  `REVIEWED` (con `reviewedAt` / `reviewedById`). Se fija en
  `finalizeInspection`; allí mismo se crean hallazgos automáticos para las
  respuestas no conformes (con `generatesFinding`) que el brigadista no
  describió, y se avisa a quienes tienen `actions.manage` en el proceso.
- El hallazgo del brigadista ya no crea plan: `assignFindingPlan` (acción,
  responsable, fecha, prioridad → `createActionPlan`) o `dismissFinding`
  («no procede», cierra el hallazgo). `completeReviewIfDone` marca la
  inspección como revisada cuando ningún hallazgo abierto queda sin plan (se
  llama también al crear planes desde la página del hallazgo).
- Bandeja `/review` (permiso `actions.manage`, alcance por proceso) y aviso en
  Inicio. Migración: las inspecciones anteriores quedan `REVIEWED` (con
  hallazgos) o `ARCHIVED`.

## Plantillas de correo

- `src/lib/email-templates.ts` (puro, servidor y navegador): esquema,
  valores por defecto, variables `{{…}}` con escape HTML, limpieza del HTML
  del administrador y `renderEmail` (marca + cuerpo + botón + pie + versión
  texto). `src/server/mail/templates.ts` lee/guarda la configuración en
  `SystemSetting` (`email.templates`); todos los correos pasan por
  `buildEmail`. La vista previa del editor usa un iframe `sandbox` sin scripts.

## Estrategia de archivos

Decisión de implementación (Fase 3): las fotos se **comprimen en el navegador**
(lado mayor 1920 px, JPEG 80 %, ~300–600 KB) y se suben **a través de la app**
(`POST /api/evidences`), que las guarda en el bucket. Frente a la URL firmada
directa al bucket planteada inicialmente, esto permite:

- Validar el **tipo real por contenido** (magic bytes: JPEG/PNG/WEBP/PDF), no
  por extensión ni por el MIME declarado.
- No depender de configurar CORS en el bucket (S3/R2).
- Mantener el bucket **privado**: `GET /api/evidences/{id}` verifica permisos
  (quien subió, o alcance sobre la inspección / hallazgo / plan / elemento) y
  transmite el archivo con `nosniff` y CSP restrictiva.

Otras reglas: tamaño máximo `UPLOAD_MAX_MB`, máximo 10 archivos por respuesta o
hallazgo, clave generada por el servidor (`inspections/{aaaa}/{mm}/{uuid}.jpg`),
checksum SHA-256, verificación de `Origin` (CSRF) en la subida y borrado
lógico. Proveedores: `STORAGE_DRIVER=s3` (AWS S3 con rol IAM o llaves, Cloudflare R2) o
`local` (disco o volumen Docker, una sola instancia). Si el volumen de archivos crece mucho, se
puede pasar a URL firmada directa conservando la validación al confirmar.

## Notificaciones (Fase 7)

- **Outbox**: `notify({ userIds, type, title, body, link, dedupeKey, excludeUserId })`
  crea `Notification` (visible de inmediato en la campana) + una
  `NotificationDelivery` EMAIL `PENDING`, dentro de la misma transacción del
  cambio de negocio. Nunca se envía correo dentro de una transacción.
- **Envío** (`dispatchPendingEmails`): cada minuto (programador interno) y en
  cada `/api/cron/run`. Cada entrega se *reclama* con un `updateMany`
  condicional sobre `attempts` (seguro con varias réplicas). Reintentos con
  espera 2/4/8/16 min, máximo 5 → `FAILED`; más de 72 h pendiente → `SKIPPED`.
  Se omite si el usuario está inactivo o desactivó los correos
  (`User.emailNotifications`, en *Mi cuenta*), o si no hay `SMTP_HOST`.
- **Eventos**: plan asignado/reasignado, devuelto, solucionado (a quienes tienen
  `actions.verify` en el proceso, excepto quien lo solucionó), verificado y
  cerrado (al responsable), hallazgo crítico y vencimiento automático (a quienes
  tienen `actions.manage` en el proceso). "En el proceso" = asignado al proceso
  o con alcance global (`actions.read.all`), vía `usersWithPermissionInProcess`.
- **Recordatorios** (`reminders.service.ts`, cada hora, idempotentes por
  `dedupeKey`): plan por vencer (≤ 3 días), plan vencido (a responsable y
  gestores, se repite cada 7 días), elemento por vencer (a 30 y 7 días),
  resumen diario de inspecciones vencidas/por vencer por zona a brigadistas y,
  a responsables de proceso, las vencidas de sus procesos (desde las 6:00 hora
  local, `APP_TIMEZONE`).
- **Interfaz**: campana con contador (consulta `/api/notifications/summary`
  cada minuto, al volver a la pestaña y al navegar; `navigator.setAppBadge`
  en la PWA instalada), bandeja `/notifications` con filtro de no leídas y
  "Marcar todas como leídas". Abrir una notificación pasa por
  `/api/notifications/[id]/open`, que solo actúa sobre notificaciones propias y
  solo redirige a rutas internas (`safeInternalLink`).
- **Nuevos canales** (WhatsApp, SMS, push): agregar la entrega en `notify()` y
  su despachador; quienes llaman a `notify()` no cambian.

## Estrategia de auditoría

- `audit(ctx, { action, entityType, entityId, before, after }, tx)` dentro de
  la misma transacción del cambio. `before/after` guardan solo campos modificados
  (`diff`) y se redactan secretos.
- Registra IP y user-agent. Ya cubre: login/logout/fallos, recuperación y
  cambio de contraseña, usuarios, roles, procesos, sedes y zonas.
- Visor con filtros en Fase 9.

## Estrategia de pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Lógica pura: programación, permisos, validaciones, rate limit, reglas de cumplimiento, máquina de estados |
| Integración | Vitest + PostgreSQL de prueba | Servicios con BD real (transacciones, alcance por permisos) |
| E2E | Playwright (móvil y escritorio) | Criterios de aceptación del MVP (flujo completo de 24 pasos) |
| Estáticas | `tsc`, ESLint | En cada commit / CI |

## Estrategia offline (PWA)

MVP: manifest, íconos, instalación y autoguardado por respuesta. Para
sincronización offline completa se necesitaría:

1. **Service Worker** (Serwist) con precache del *shell* y de la ruta de
   inspección; caché *stale-while-revalidate* de catálogos.
2. **Descarga previa** de inspecciones pendientes del inspector (elementos +
   plantilla publicada) a **IndexedDB** (Dexie).
3. **Captura local**: respuestas y fotos (Blob) en IndexedDB con
   `Inspection.clientId` (UUID generado en el cliente, ya existe en el esquema).
4. **Cola de sincronización** (Background Sync o reintento al recuperar red):
   endpoint idempotente `POST /api/v1/sync/inspections` que hace *upsert* por
   `clientId`, sube fotos con URLs firmadas y devuelve el resultado.
5. **Conflictos**: la inspección es propiedad del inspector y es inmutable al
   finalizarse → "primero en llegar gana"; si el elemento fue inspeccionado por
   otra persona en ese lapso, ambas se conservan y se recalcula la próxima fecha.
6. UI de estado: "Sin conexión · 3 inspecciones por sincronizar".
