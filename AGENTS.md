# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Amazon FBA Wholesale Sourcing App — a full-stack **Next.js 16** (TypeScript/React 19) application. Single service: Next.js serves both the React frontend and API routes (`/api/analyze`, `/api/upload`, `/api/config`). No database or Docker required.

### Commands

| Task | Command |
|------|---------|
| Install deps | `npm ci` (uses `package-lock.json`) |
| Dev server | `npm run dev` → http://localhost:3000 |
| Build | `npm run build` |
| Lint | `npm run lint` (ESLint, `--max-warnings=0`) |
| Type check | `npx tsc --noEmit` |

### Caveats

- **Lint has 6 pre-existing warnings** (unused vars, `<img>` vs `<Image />`). Because the script uses `--max-warnings=0`, `npm run lint` exits non-zero. These are not regressions — they exist in the base branch.
- **SP-API credentials required at runtime**: The API routes call `requiredEnv()` in `lib/env.ts` which throws if `SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET`, `SP_API_REFRESH_TOKEN`, `AWS_ACCESS_KEY_ID`, or `AWS_SECRET_ACCESS_KEY` are missing from `.env.local`. The dev server starts fine without them; the error only triggers when API routes are invoked.
- **`.env.local` setup**: Copy `.env.example` to `.env.local`. Placeholder values are sufficient for starting the dev server and testing the frontend. Real Amazon SP-API credentials are needed only for end-to-end product lookups.
- There is also a legacy **Streamlit (Python)** app in `app.py` with `requirements.txt`. It is not the primary application.
