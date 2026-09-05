# Live-verified fixtures — 2026-09-04

Captured by running `dime-api`'s dev server locally (`npm run dev`, :4000, against the real
`dime_dev` Postgres database) and calling real endpoints, per the `tdd` skill's step 3 ("verify
against the deployed system, not the document describing it"). `prisma migrate status` confirmed the
schema is up to date against the live DB (2 migrations applied, no drift) before this pass.

## What these fixtures corrected vs. static-analysis assumptions

- **Response envelopes are per-endpoint, not uniform.** Confirmed live:
  - `POST /api/auth/register` → flat `{accessToken, refreshToken, user}` (`register-response.json`)
  - `GET /api/categories` → `{categories: [...]}` (`categories-list-response.json`) — **not** a bare
    array, contrary to the initial reuse/rebuild research's assumption
  - `GET /api/transactions` → `{items: [...], nextCursor}`
  - `GET /api/budgets` → `{budgets: [...]}`
  - `GET /api/templates` → `{templates: [...]}`
  - `GET /api/ledger/people` → `{people: [...], summary: {...}}`
  - `GET /api/analytics/overview` → flat object, no wrapper key
  - The port must preserve each endpoint's **exact existing envelope**, verified per-route — not
    assumed from a "list endpoints return arrays" convention.
- **Error shapes, live-confirmed as three real, distinct shapes** (matches `TDD-PAISA.md` §3.1):
  - 401 (auth hook): structured `{"error":{"code":"UNAUTHORIZED","message":"Invalid or missing token"}}`
  - 400 (validation, e.g. missing required field): flat `{"error":"Required"}` / `{"error":"Name is required"}`
  - 400 (business-rule, e.g. bad category reference): flat `{"error":"Invalid category ID"}`
- **CSV export**: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment;
  filename="paisa-export-<date>.csv"`, `Cache-Control: no-store`, and the body starts with a **UTF-8
  BOM** (`﻿`) before the header row `Date,Amount,Type,Category,Note` — for Excel compatibility.
  Must be preserved byte-for-byte in the buffered-response port (see `csv-export-sample.csv`).
- **Rate limiting**: the CSV-export override header confirmed live at `x-ratelimit-limit: 10` (matches
  `csv.routes.ts`'s per-route override). The *global* limit is env-configurable
  (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW`) — this local dev environment has it set far above the
  code-level default of 100/min (observed `x-ratelimit-limit: 100000` on `/health` and other
  non-overridden routes), which is itself worth carrying into the port: keep the new limiter's default
  configurable via env, not hardcoded.
- **Default category seeding**: 18 categories seeded on register (Allowance, Education, Entertainment,
  Food, Freelance, Gifts, Healthcare, Investments, Other, Personal Care, Rent, Rental Income, Salary,
  Shopping, Subscriptions, Transport, Travel, Utilities) — confirms `defaultCategories.ts` ports
  verbatim with no drift from what's actually seeded live.

## Files
- `register-response.json` — live `POST /api/auth/register` response body
- `categories-list-response.json` — live `GET /api/categories` response body (18 seeded categories)
- `csv-export-sample.csv` — live `GET /api/csv/export` response (headers + body, includes BOM)
