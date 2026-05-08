# Putting the app on the internet

## Railway essentials (production)

After your first deploy:

1. **`NEXTAUTH_URL`** — Must be your public HTTPS origin (no trailing slash), e.g. `https://your-service.up.railway.app`.
2. **Stripe** — Production **secret** key, correct **live** Price IDs, and a **Stripe webhook** pointing to  
   `https://YOUR_ORIGIN/api/billing/webhook` with the signing secret in `STRIPE_WEBHOOK_SECRET`.
3. **Health checks** — In Railway → your service → **Settings** → **Healthcheck**, set the path to **`/api/health`**  
   so the platform probes database readiness (adjust timeout if cold starts need more time).
4. **Legal policies** — The app ships **templates** at **`/terms`** and **`/privacy`**. Customize copy with your lawyer, then  
   set `NEXT_PUBLIC_LEGAL_ENTITY` (and `SUPPORT_EMAIL` or `NEXT_PUBLIC_SUPPORT_EMAIL`). Links appear on login, get-access,
   promo signup, and subscribe.
5. **`RAILWAY_PUBLIC_DOMAIN`** (optional) — If set to your Railway hostname (`your-app.up.railway.app`), it helps canonical  
   URLs in metadata when `NEXTAUTH_URL` is not available at build time.

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
