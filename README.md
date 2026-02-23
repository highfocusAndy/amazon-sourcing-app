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
  - Calculates:
    - `Net Profit = Buy Box - Wholesale Price - Amazon Fees`
    - `ROI% = (Net Profit / Wholesale Price) * 100`

- **Smart decision logic**
  - Auto-flags **BAD** if Amazon is a seller or BSR is over 100,000.
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
    - Red: bad rank, loss, or thin margin

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
- Batch analysis concurrency can be tuned with `BATCH_ANALYZE_CONCURRENCY` in `.env.local` (default: 3).
- If Amazon seller detection needs marketplace-specific IDs, set `AMAZON_SELLER_IDS` as a comma-separated list.
- Restricted brand matching comes from `RESTRICTED_BRANDS` in `.env.local` (comma-separated).
- If testing from another device/browser origin in dev, set `ALLOWED_DEV_ORIGINS` (comma-separated full origins).
