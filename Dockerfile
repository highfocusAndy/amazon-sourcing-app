# syntax=docker/dockerfile:1
# Single-stage build — no secrets passed as ARG/ENV at build time.
# Railway injects all service variables as runtime environment variables only.

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

# Install deps (postinstall runs `prisma generate` — reads schema only, no secrets needed)
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# Build — no secrets required; all env vars are accessed at request time, not build time
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# mkdir -p /data ensures the Railway volume mount point exists before Prisma writes SQLite.
CMD ["sh", "-c", "mkdir -p /data && npm run start:deploy"]
