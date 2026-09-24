<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Convenciones del proyecto

- Arquitectura y decisiones: `docs/ARCHITECTURE.md`. Leerlo antes de agregar módulos.
- Capas: `app` (páginas) → `server/actions` (Server Actions con `runAction` + Zod) → `server/services` (negocio, transacciones, `audit`) → `server/db`.
- Toda página protegida usa `requirePagePermission`; toda acción usa `requirePermission`. Nunca confiar en ocultar botones.
- Permisos: catálogo en `src/lib/permissions.ts`; tras agregar uno, ejecutar `npm run db:seed`.
- Fechas de inspección: usar solo `src/lib/scheduling.ts`.
- Cliente Prisma generado en `src/generated/prisma` (importar desde `@/generated/prisma/client`).
- Antes de commitear: `npm run lint && npm run typecheck && npm test && npm run build`.
