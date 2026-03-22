# Putting the app on the internet

## Option A — Railway (recommended for this repo: SQLite + volume)

1. Push the project to GitHub (if it is not already).
2. Open [Railway](https://railway.app) → **New Project** → **Deploy from GitHub** → select this repo.
3. Railway will detect Next.js. Add **Variables** (same names as your `.env.local`):
   - `DATABASE_URL` — use a **persistent DB file on the volume** (see step 5).
   - `AUTH_SECRET`, `NEXTAUTH_URL` (your public `https://…` Railway URL, no trailing slash)
   - All Amazon / AWS variables (`SP_API_*`, `AWS_*`, etc.)
4. **Settings → Networking → Generate Domain** so you get `https://something.up.railway.app`.
5. **Add a volume**: **New** → **Volume** → mount path **`/data`**.  
   Do **not** mount over `/app/prisma` (that would hide migrations in the image).  
   Set `DATABASE_URL` to:
   ```env
   DATABASE_URL=file:/data/prod.db
   ```
6. Redeploy. First boot runs `prisma migrate deploy` and creates tables on the volume.
7. In **Amazon Developer Central**, add **Login** and **Redirect** URIs using your Railway domain:
   - `https://YOUR_DOMAIN/api/amazon/oauth/login`
   - `https://YOUR_DOMAIN/api/amazon/oauth/callback`

## Option B — Vercel (needs PostgreSQL)

Vercel’s filesystem is not suitable for SQLite. Use a hosted Postgres (e.g. [Neon](https://neon.tech)):

1. Create a Neon database; copy the `postgresql://…` connection string.
2. Change `prisma/schema.prisma` `datasource` to `provider = "postgresql"` and replace migrations with a fresh PostgreSQL baseline (or use `prisma db push` only for a throwaway demo).
3. Connect the repo to [Vercel](https://vercel.com), set all env vars including `DATABASE_URL` (Postgres) and `NEXTAUTH_URL` (your Vercel URL).
4. Build command can stay `npm run build` (`postinstall` runs `prisma generate`). Use `prisma migrate deploy` in the build step once migrations are Postgres-based.

## Option C — ngrok (quick share, no deploy)

1. Run `npm run dev` and `ngrok http 3000`.
2. Set `NEXTAUTH_URL=https://YOUR_SUBDOMAIN.ngrok-free.app` (no trailing slash).
3. Register the same origin in Amazon for Login + Redirect URIs.
4. Restart `npm run dev` after changing env.

Data stays local; the tunnel URL changes on free ngrok unless you use a reserved domain.
