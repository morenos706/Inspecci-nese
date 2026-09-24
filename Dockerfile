# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Imagen de producción multi-etapa (Next.js standalone).
#   docker build -t inspecciones:latest .
#   docker build --target migrate -t inspecciones-migrate:latest .
# -----------------------------------------------------------------------------
ARG NODE_VERSION=22-alpine

# ---- Dependencias
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall ejecuta `prisma generate` (no necesita conexión a BD)
RUN npm ci

# ---- Build
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
# Valores de relleno SOLO para compilar; los reales se inyectan en tiempo de ejecución.
ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime
RUN npm run build

# ---- Migraciones + seed (job de despliegue; usa las dependencias completas)
FROM builder AS migrate
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# ---- Runtime mínimo
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
