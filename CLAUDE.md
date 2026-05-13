# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev               # Start dev server at http://localhost:3000
npm run build             # Production build
npm run lint              # ESLint (zero warnings enforced)
npm run db:seed           # Seed promo codes + optional app owner
npm run db:reset-all      # Full reset: delete all users & promos, recreate test codes
npm run stripe:webhook    # Local Stripe webhook listener
```

Prisma migrations run automatically via `postinstall`. To apply schema changes manually: `npx prisma migrate dev`.

No automated test suite — linting is the primary code quality gate.

## Architecture

**Stack:** Next.js App Router, TypeScript, SQLite + Prisma ORM, NextAuth v5, Tailwind CSS 4.

**Core purpose:** Amazon FBA wholesale sourcing tool. Users upload Excel/CSV lists of products (ASIN/UPC + wholesale price), the app enriches each via Amazon SP-API, calculates profit/ROI, and outputs a color-coded BUY/BAD/WORTH UNGATING decision.

### Route structure

- `app/(dashboard)/` — Protected routes. `page.tsx` is the main analysis dashboard (upload + manual search). `analyzer/` is the catalog/keyword explorer.
- `app/api/` — ~52 endpoints. Core ones: `POST /api/analyze` (single product), `POST /api/analyze/keyword-search`, `POST /api/catalog/search`, `GET/POST /api/amazon/oauth/*`.
- `app/admin/` — Owner-only dashboard (gated by `APP_OWNER_EMAIL`).
- `auth.ts` + `middleware.ts` — NextAuth config and route protection.

### Key library files

- `lib/analysis.ts` — Core profit calculation, risk flag detection, and decision engine (`BUY`, `BAD`, `LOW_MARGIN`, `NO_MARGIN`, `WORTH UNGATING`, `UNKNOWN`).
- `lib/sp-api.ts` — All SP-API calls: catalog, pricing, offers, fees, restrictions.
- `lib/amazonAccount.ts` + `lib/amazonOAuth.ts` — Per-user Amazon OAuth token management.
- `lib/paApiClient.ts` — Product Advertising API (optional; provides main-category BSR).
- `lib/types.ts` — Shared TypeScript interfaces (`ProductAnalysis`, `Decision`, etc.).
- `lib/usageQuota.ts` — Monthly per-user usage tracking and plan limits.
- `lib/apiRateLimit.ts` — Upstash Redis rate limiting.

### Data flow for product analysis

1. ASIN/UPC + wholesale price → `POST /api/analyze`
2. SP-API: catalog lookup → offers → fee preview → restrictions
3. Optional PA-API call for main-category BSR
4. `lib/analysis.ts` computes profit, ROI, risk flags, ungating economics
5. Result stored in React context; user can export or save

### Auth model

- **Credentials:** email + bcrypt password (cost 12), JWT session.
- **Passkeys:** WebAuthn via `@simplewebauthn`; challenge stored in DB with TTL.
- **Amazon OAuth:** per-user SP-API tokens via website authorization workflow. Refresh token encrypted (AES-GCM) with `AUTH_SECRET` and stored in `AmazonAccount.spRefreshTokenEnc`. If no per-user token, falls back to global `SP_API_REFRESH_TOKEN` env var.

### Database (Prisma + SQLite)

Key models: `User`, `AmazonAccount`, `PasskeyCredential`, `PasswordResetToken`, `UserPreferences`, `UserExplorerFilters`, `PromoCode`, `PromoRedemption`, `UserMonthlyUsage`, `ApiResponseCache`.

`ApiResponseCache` is used to cache SP-API responses (TTL-based) to reduce API calls.

### Billing

Stripe subscriptions (Starter / Pro plans). `APP_OWNER_EMAIL` bypasses all billing. Trial length set by `SIGNUP_TRIAL_DAYS_DEFAULT`. Monthly usage limits enforced per plan via `lib/usageQuota.ts`.

### Bulk upload

Drag-and-drop `.xlsx`/`.xls`/`.csv`. Smart header detection (case-insensitive aliases). Max 200 rows. Batch concurrency controlled by `BATCH_ANALYZE_CONCURRENCY` env var (default 6, max 10).

## Critical environment variables

```env
AUTH_SECRET=           # Generate: npx auth secret
NEXTAUTH_URL=          # Public origin (no trailing slash)
DATABASE_URL=          # file:./dev.db (dev) | file:/data/prod.db (Railway)
SP_API_CLIENT_ID=
SP_API_CLIENT_SECRET=
SP_API_REFRESH_TOKEN=  # Optional if all users OAuth
SP_API_APPLICATION_ID= # Required for public Amazon OAuth flow
SELLER_ID=
MARKETPLACE_ID=        # US: ATVPDKIKX0DER
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_OWNER_EMAIL=       # Grants admin access + billing bypass
```

PA-API keys (`PA_API_ACCESS_KEY`, `PA_API_SECRET_KEY`, `PA_API_PARTNER_TAG`) are optional — without them, main-category BSR is unavailable but the app still functions.
