# Amazon FBA Wholesale Sourcing App (Next.js)

Full-stack Next.js application for Amazon FBA wholesale sourcing decisions.  
It supports manual ASIN/UPC lookups and bulk spreadsheet uploads, enriches products with Amazon SP-API data, and applies profit/risk/ungating logic in a sortable dashboard.

## Core Features

- **Data input**
  - Drag-and-drop upload zone for `.xlsx`, `.xls`, and `.csv`.
  - Universal parsing via `xlsx` with smart header normalization and column detection across supplier formats.
  - Accepts rows with ASIN/UPC/EAN/barcode or product name/title plus wholesale cost.
  - Manual search form for single ASIN/UPC lookups.

- **Amazon SP-API integration**
  - Pulls **Buy Box price**, **Sales Rank (BSR)**, and **Fee Preview**.
  - **Main product-page BSR**: If you set optional Product Advertising API (PA-API) credentials (`PA_API_ACCESS_KEY`, `PA_API_SECRET_KEY`, `PA_API_PARTNER_TAG`), the app uses the **main category BSR** shown on the product page instead of a subcategory rank from SP-API.
  - **Estimated monthly sales**: A BSR-based estimate (units/month) is shown; when PA-API is used, the category name improves the estimate. **This is approximate only**—Amazon does not publish real velocity; use for comparison, not exact planning.
  - Calculates:
    - `Net Profit = Buy Box - Wholesale Price - Amazon Fees`
    - `ROI% = (Net Profit / Wholesale Price) * 100`

- **Smart decision logic**
  - Auto-flags **BAD** if BSR is over 100,000 or IP complaint risk.
  - Adds seller-account risk checks from Listings Restrictions API:
    - approval required
    - listing restricted for your account
    - IP complaint risk signals from restriction reasons
  - Ungating calculator for restricted brands:
    - 10-unit invoice cost
    - break-even unit estimate
    - **WORTH UNGATING** when projected monthly profit is over 2x ungating cost

- **UI/UX**
  - Tailwind-powered dashboard with sortable table.
  - Color coded rows:
    - Green: profitable and low risk
    - Yellow: ungating opportunity
    - Red: bad rank, low margin, or no margin (deficit)

- **Security**
  - Credentials are loaded from `.env.local`.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.example .env.local
```

3. Fill your SP-API and AWS credentials in `.env.local`, including:
   - `SP_API_CLIENT_ID`
   - `SP_API_CLIENT_SECRET`
   - `SP_API_REFRESH_TOKEN`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_SESSION_TOKEN` (required only for temporary `ASIA...` keys)
   - `AWS_REGION`
   - `SELLER_ID`
   - `MARKETPLACE_ID`

   Notes:
   - If `AWS_ACCESS_KEY_ID` starts with `AKIA`, leave `AWS_SESSION_TOKEN` empty.
   - If `AWS_ACCESS_KEY_ID` starts with `ASIA`, you must provide `AWS_SESSION_TOKEN`.

### Connect Amazon (per-user OAuth)

For a **public** Selling Partner API app, each seller authorizes your application instead of sharing one global refresh token.

1. In [Amazon Developer Central](https://developercentral.amazon.com), open your SP-API app and set:
   - **Login URI:** `{YOUR_PUBLIC_ORIGIN}/api/amazon/oauth/login`  
     (e.g. `https://yourdomain.com/api/amazon/oauth/login`)
   - **Redirect URI:** `{YOUR_PUBLIC_ORIGIN}/api/amazon/oauth/callback`
2. Add to `.env.local`:
   - `SP_API_APPLICATION_ID` — application ID from the app (e.g. `amzn1.sellerapps.app.xxxxx`)
   - `NEXTAUTH_URL` or `AUTH_URL` — same public origin (used for OAuth `redirect_uri`)
   - While the app is in **Draft**, set `SP_API_OAUTH_DRAFT=true`
3. In the app, signed-in users click **Connect Amazon (OAuth)** (Explorer/Analyzer modal or settings). The flow follows Amazon’s [website authorization workflow](https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow) (consent → your login route → Amazon confirm → callback).
4. The server still needs **LWA client** (`SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET`) and **AWS signing keys** for SP-API requests. User refresh tokens are stored encrypted (key derived from `AUTH_SECRET`).

`SP_API_REFRESH_TOKEN` + `SELLER_ID` remain optional if every user connects via OAuth; they still work as a **single global** seller for development.

4. Run development server:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## API Endpoints

- `POST /api/analyze`  
  JSON body:

```json
{
  "identifier": "012345678901",
  "wholesalePrice": 8.5,
  "brand": "Example Brand",
  "projectedMonthlyUnits": 30
}
```

- `POST /api/upload`  
  Multipart form data:
  - `file` (`.xlsx`/`.xls`/`.csv`)
  - `projectedMonthlyUnits` (optional)

## Notes

- Batch uploads are capped at 200 rows per request to reduce SP-API rate-limit pressure.
- Batch analysis concurrency can be tuned with `BATCH_ANALYZE_CONCURRENCY` in `.env.local` (default: 6, max: 10). Higher values speed up Excel uploads but may hit SP-API rate limits.
- **Explorer product list**: Products are from **catalog search** for the selected category/keyword, then **sorted by BSR** in the app. The list is not “top N in category by BSR” from Amazon—some top sellers (e.g. BSR 42) may not appear until you use **Load more** to fetch more search results.
- Restricted brand matching comes from `RESTRICTED_BRANDS` in `.env.local` (comma-separated).
- If testing from another device/browser origin in dev, set `ALLOWED_DEV_ORIGINS` (comma-separated full origins).
