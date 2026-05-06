# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────
# STAGE 1 — deps: instala dependencias con pnpm
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

# libc6-compat: algunos paquetes precompilados esperan glibc; Alpine usa musl
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Habilita pnpm via corepack (viene con Node 22, no requiere npm install -g)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Solo copiamos manifests para aprovechar cache de Docker:
# si package.json/lock no cambian, no reinstala
COPY package.json pnpm-lock.yaml ./

# --frozen-lockfile = falla si lock no matchea (build reproducible)
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# STAGE 2 — builder: prisma generate + next build
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Trae node_modules ya instalado del stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Ahora sí copiamos todo el código fuente
COPY . .

# Telemetría de Next desactivada en build (más rápido, sin fugas a Vercel)
ENV NEXT_TELEMETRY_DISABLED=1

# Genera el Prisma Client (driver adapter, sin binary engine)
RUN pnpm prisma generate

# Build de producción — gracias a output:standalone genera .next/standalone
RUN pnpm build

# ─────────────────────────────────────────────────────────────
# STAGE 3 — runner: imagen final, mínima, lo que se publica a ECR
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Usuario no-root por seguridad — nunca corras containers como root en prod
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copia los assets públicos
COPY --from=builder /app/public ./public

# Copia el output standalone (incluye node_modules trimeado y server.js)
# El --chown asegura que el usuario nextjs sea dueño de los archivos
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
# HOSTNAME 0.0.0.0 = escucha en todas las interfaces (necesario en containers)
# Si dejás 'localhost' o no lo seteás, App Runner no puede llegar al proceso
ENV HOSTNAME=0.0.0.0

# server.js es el entrypoint que genera Next standalone
CMD ["node", "server.js"]
