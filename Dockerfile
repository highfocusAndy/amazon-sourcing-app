# syntax=docker/dockerfile:1

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Install deps first (layer-cached until package-lock changes)
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# postinstall runs `prisma generate` — reads schema only, no DB connection or secrets needed
RUN npm ci

# Copy source and build — no secrets passed as ARG/ENV
COPY . .
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Copy only what next start needs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Secrets are injected by Railway as runtime environment variables — never baked in.
# mkdir -p /data ensures the Railway volume mount point exists before Prisma writes SQLite.
CMD ["sh", "-c", "mkdir -p /data && npm run start:deploy"]
