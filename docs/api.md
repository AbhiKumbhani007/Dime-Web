# API

`dime-web`'s own `/api/*` Route Handlers — the surface consumers should read here rather than in
`phases/`, which is planning material and goes stale once a feature ships. Updated by whichever ticket
changes an endpoint, field, status code, or error.

Every response uses the standardized error envelope for errors: `{ error: { code, message } }`, where
`code` is one of `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404), `CONFLICT` (409),
`RATE_LIMITED` (429), `INTERNAL_ERROR` (500) — see `lib/server/errorResponse.ts`.

## Health

| Method | Path                                                                        | Auth | Rate limited | Success                           | Errors |
| ------ | --------------------------------------------------------------------------- | ---- | ------------ | --------------------------------- | ------ |
| GET    | `/api/health` (also reachable at `/health`, via a `next.config.ts` rewrite) | none | no           | `200 { status: "ok", timestamp }` | —      |

## Auth

`register`/`login`/`refresh`/`google` need no bearer token (they issue one). Every other endpoint below
requires `Authorization: Bearer <token>` (verified via `lib/server/auth/authenticate.ts`). All 7 endpoints
are subject to the global rate limit, same as every other module — `dime-api`'s own source registers its
rate limiter once, globally, with no per-route exemption for auth. Access tokens are signed with `jose`
(HS256, 15-minute TTL, `{userId,email}` payload) using the same `JWT_ACCESS_SECRET` value `dime-api` uses,
so a token issued by either system verifies against both during the transition. Refresh tokens are opaque
`crypto.randomUUID()` values stored in `RefreshToken` with a 30-day expiry, rotated (old token deleted) on
every `/api/auth/refresh` call.

| Method | Path                    | Auth | Request body                     | Success                                          | Errors                                                                 |
| ------ | ----------------------- | ---- | --------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/auth/register`    | none | `{ email, password, name? }`      | `201 { accessToken, refreshToken, user }` (flat)  | `400` (validation), `409` (email already registered), `429`             |
| POST   | `/api/auth/login`       | none | `{ email, password }`             | `200 { accessToken, refreshToken, user }` (flat)  | `400` (validation), `401` (invalid email/password), `429`               |
| POST   | `/api/auth/refresh`     | none | `{ refreshToken }`                | `200 { accessToken, refreshToken }` (rotated)     | `400` (validation), `401` (invalid/expired/already-used token), `429`   |
| POST   | `/api/auth/logout`      | none | `{ refreshToken }`                | `204` (idempotent — no-ops if token not found)    | `400` (validation), `429`                                               |
| GET    | `/api/auth/me`          | yes  | —                                  | `200 UserProfile` (flat)                          | `401`, `404` (token valid but the user row no longer exists), `429`     |
| PATCH  | `/api/auth/me`          | yes  | `{ name?, theme? }`               | `200 UserProfile` (flat)                          | `401`, `429`                                                             |
| PATCH  | `/api/auth/me/password` | yes  | `{ oldPassword, newPassword }`    | `200 {}` (empty object)                           | `400` (wrong old password, or `newPassword` under 8 chars), `401`, `429` |
| DELETE | `/api/auth/me`          | yes  | —                                  | `204`                                              | `401`, `429`                                                             |
| POST   | `/api/auth/google`      | none | `{ idToken }`                     | `200 { accessToken, refreshToken, user }` (flat)  | `400` (validation), `401` (invalid Google token / missing `email` claim), `429` |

**Note on envelopes:** unlike every other module in this doc, `register`/`login`/`refresh`/`google`'s
success bodies are **flat** (`{accessToken,refreshToken,user}`, no wrapper), matching the live-verified
`dime-api` shape. `me` GET/PATCH return a flat `UserProfile`, not `{user: UserProfile}`.

`UserProfile`: `{ id, email, name: string | null, theme, createdAt }`.

## Categories

All four endpoints require a bearer token (`Authorization: Bearer <token>`, verified via
`lib/server/auth/authenticate.ts`) and are subject to the global rate limit (`RATE_LIMIT_MAX` requests
per `RATE_LIMIT_WINDOW_SECONDS`, see `docs/operations.md`).

| Method | Path                  | Request body                                                      | Success                          | Errors                                                                                 |
| ------ | --------------------- | ----------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/categories`     | —                                                                 | `200 { categories: Category[] }` | `401`, `429`                                                                           |
| POST   | `/api/categories`     | `{ name, emoji, color? }` (`color` defaults to `#6366f1`)         | `201 { category: Category }`     | `400` (validation), `401`, `409` (duplicate name for this user), `429`                 |
| PATCH  | `/api/categories/:id` | partial `{ name?, emoji?, color? }` (at least one field required) | `200 { category: Category }`     | `400` (invalid id or empty body), `401`, `404`, `409` (duplicate name), `429`          |
| DELETE | `/api/categories/:id` | —                                                                 | `204` (no body)                  | `400` (invalid id), `401`, `404`, `409` (referenced by a transaction or budget), `429` |

**Note on envelopes:** every success body wraps its payload in a named key (`categories`, `category`) —
none of these endpoints return a bare array or object. `POST`/`PATCH` returning `{category}` rather than
a bare `Category` was a `phases/001-merge-backend-into-nextjs/tdd.md` correction made while shipping
this pair; see that document's API contracts table for the full history.

## Transactions

All five endpoints require a bearer token (`Authorization: Bearer <token>`) and are subject to the
global rate limit, same as Categories.

| Method | Path                    | Request                                                                      | Success                                                  | Errors                                                                                   |
| ------ | ----------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/transactions`     | query: `categoryId?, isIncome?, search?, from?, to?, limit?(<=100), cursor?` | `200 { items: Transaction[], nextCursor: string\|null }` | `401`, `429`                                                                             |
| POST   | `/api/transactions`     | `{ amount, date, note?, isIncome, categoryId, templateId? }`                 | `201 { transaction: Transaction }`                       | `400` (validation), `401`, `404` (category not owned), `429`                             |
| GET    | `/api/transactions/:id` | —                                                                            | `200 { transaction: Transaction }`                       | `400` (invalid id), `401`, `404`, `429`                                                  |
| PATCH  | `/api/transactions/:id` | partial `{ amount?, date?, note?, isIncome?, categoryId? }`                  | `200 { transaction: Transaction }`                       | `400` (invalid id, empty body, or new categoryId not owned → `404`), `401`, `404`, `429` |
| DELETE | `/api/transactions/:id` | —                                                                            | `204` (no body)                                          | `400` (invalid id), `401`, `404`, `429`                                                  |

**Note on envelopes:** the list endpoint returns `{items, nextCursor}` unwrapped; every single-transaction
response (`POST`/`GET :id`/`PATCH`) wraps its payload as `{transaction}`. `phases/001-merge-backend-into-nextjs/tdd.md`'s
contracts table originally documented `POST`/`GET :id`/`PATCH` as returning a bare `Transaction` — that was
wrong (dime-api's actual source and dime-web's already-shipped frontend client both wrap it), corrected
during F2; see `phases/001-merge-backend-into-nextjs/tickets/F2.md`'s Decisions table.

**`templateId` on create** is a write-time signal only — it is never persisted on the `Transaction` record.
If it references a template owned by the caller, that template's `usageCount` is incremented and
`lastUsedAt` is stamped; if it references an unowned or unknown template, the create still succeeds and the
bump silently no-ops.

**`note` cannot be cleared via `PATCH`** — `{note: null}` is rejected with `400` (the schema has no
`.nullable()`). This is a known, deliberately-preserved gap carried over from `dime-api`, not a missed
case; see F2.md's Decisions table.

## Budgets

All five endpoints require a bearer token and are subject to the global rate limit (same as Categories).
A budget tracks a spend limit for one category over a recurring period (`DAILY`/`WEEKLY`/`MONTHLY`/`YEARLY`);
`GET /api/budgets` and `GET /api/budgets/:id/progress` compute spend against transactions in the currently
active period window.

| Method | Path                        | Request body                                                                                                              | Success                                                                                                                                        | Errors                                                                               |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `/api/budgets`              | —                                                                                                                         | `200 { budgets: BudgetWithProgress[] }` — each budget includes `spent`, `remaining`, `percent`, `daysRemaining`, `periodStart`, `periodEnd`    | `401`, `429`                                                                         |
| GET    | `/api/budgets/:id/progress` | —                                                                                                                         | `200 { budget: Budget, spent, remaining, percent, daysRemaining, periodStart, periodEnd }` (flat — `budget` merged in, not wrapped separately) | `400` (invalid id), `401`, `404`, `429`                                              |
| POST   | `/api/budgets`              | `{ name, emoji, colour?, type, amount, categoryId, startDate? }` (`colour` defaults to `#6366f1` — note British spelling) | `201 { budget: Budget }`                                                                                                                       | `400` (validation), `401`, `404` (category not owned), `429`                         |
| PATCH  | `/api/budgets/:id`          | partial `{ name?, emoji?, colour?, type?, amount?, categoryId?, startDate? }` (at least one field required)               | `200 { budget: Budget }`                                                                                                                       | `400` (invalid id or empty body), `401`, `404` (budget or category not found), `429` |
| DELETE | `/api/budgets/:id`          | —                                                                                                                         | `204` (no body)                                                                                                                                | `400` (invalid id), `401`, `404`, `429`                                              |

**Note on envelopes:** `POST`/`PATCH` returning `{budget}` rather than a bare `Budget`, and the progress
endpoint's flat `{budget, spent, ...}` shape, were both `phases/001-merge-backend-into-nextjs/tdd.md`
corrections made while shipping this feature (F3) — the design doc had inherited the same
"documented bare, actually wrapped" mistake F1 already found and fixed for categories. See that
document's API contracts table for the full history. Unlike categories, budgets have no uniqueness or
in-use constraint, so there is no `409` case anywhere in this module.

## Templates

All four endpoints require a bearer token (`Authorization: Bearer <token>`) and are subject to the global
rate limit, same as Categories.

| Method | Path                 | Request body                                                         | Success                         | Errors                                                                                    |
| ------ | -------------------- | -------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | `/api/templates`     | query: `sort?(usage\|recent\|label)`, defaults to `usage`            | `200 { templates: Template[] }` | `400` (invalid `sort`), `401`, `429`                                                      |
| POST   | `/api/templates`     | `{ label, emoji?, amount?, note?, isIncome?, categoryId? }`          | `201 { template: Template }`    | `400` (validation), `401`, `404` (`categoryId` not owned), `409` (duplicate label), `429` |
| PATCH  | `/api/templates/:id` | partial `{ label?, emoji?, amount?, note?, isIncome?, categoryId? }` | `200 { template: Template }`    | `400` (invalid id or empty body), `401`, `404`, `409` (duplicate label), `429`            |
| DELETE | `/api/templates/:id` | —                                                                    | `204` (no body)                 | `400` (invalid id), `401`, `404`, `429`                                                   |

**Note on envelopes:** `POST`/`PATCH` return `{template: Template}` (wrapped), not a bare `Template`.
`phases/001-merge-backend-into-nextjs/tdd.md`'s contracts table originally documented them as bare — that
was wrong (dime-api's actual source and dime-web's already-shipped frontend client both wrap it), corrected
during F4; see `phases/001-merge-backend-into-nextjs/tickets/F4.md`'s Decisions table. The identical class
of correction F1 made for categories.

**`amount`/`note`/`categoryId` are nullable on `PATCH` but not on `POST`** — a template can be created
without them (simply omitted) but an existing value can only be explicitly cleared via `null` through an
update. Clearing `categoryId` via `null` skips the ownership check a non-null value triggers.

**The `usageCount`/`lastUsedAt` bump on transaction create is not implemented here** — it belongs to the
transactions module (Feature 2), which increments a referenced template's counters as a write-time side
effect and never persists `templateId` on the transaction itself.

## Analytics

All six endpoints require a bearer token and are subject to the global rate limit, same as Categories.
Every endpoint is read-only — there is no `POST`/`PATCH`/`DELETE` anywhere in this module, and none of the
six can 404 or 409 (they read only the caller's own transactions/budgets, scoped by `userId`, never a
specific resource by id).

| Method | Path                                | Request                                    | Success                                                                                        | Errors                |
| ------ | ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------- |
| GET    | `/api/analytics/overview`           | query: `from?, to?`                         | `200` flat `{totalIncome, totalExpense, netBalance, transactionCount, avgDailySpend, from, to}`   | `400` (bad date), `401`, `429` |
| GET    | `/api/analytics/by-period`          | query: `period(weekly\|monthly\|yearly), date?, categoryId?` | `200` flat `{period, labels: string[], income: number[], expense: number[], net: number[], from, to}` | `400` (bad `period`/`categoryId`), `401`, `429` |
| GET    | `/api/analytics/by-category`        | query: `from?, to?, isIncome?`              | `200 { categories: CategoryBreakdownRow[] }` — each `{category: {id,name,emoji,color}\|null, total, percent, count}` | `400` (bad date), `401`, `429` |
| GET    | `/api/analytics/trends`             | query: `months?(default 6, max 36)`         | `200 { trends: TrendRow[] }` — each `{month: "YYYY-MM", income, expense, net}`, oldest first     | `400` (bad `months`), `401`, `429` |
| GET    | `/api/analytics/top-days`           | query: `from?, to?, limit?(default 10, max 100)` | `200 { days: TopDayRow[] }` — each `{date: "YYYY-MM-DD", total}`, expense-only, sorted descending | `400` (bad date/`limit`), `401`, `429` |
| GET    | `/api/analytics/budget-vs-actual`   | —                                            | `200 { budgets: BudgetVsActualRow[] }` — each `{budget: {id,name,emoji,type}, allocated, spent, remaining, percent}` | `401`, `429`           |

**`by-period`'s query params and response shape are not what `tdd.md` originally documented** — it had
`bucket(weekly|monthly|yearly),from?,to?` in and an unspecified "series array" out. The actual contract
(param named `period`, a single `date` instead of a range, plus an optional `categoryId` filter; a flat
object of parallel arrays out, not an array of rows) matches `dime-web`'s already-shipped
`lib/api/analytics.ts`/`hooks/useAnalytics.ts`, which the insights page already calls this way in
production. Corrected during F5 — see `phases/001-merge-backend-into-nextjs/tickets/F5.md`'s Decisions
table. Same class of "TDD documented the wrong shape" correction F1 through F4 each made once for their
own module.

**Bucketing for `by-period`:** `weekly` → 7 daily buckets, Monday–Sunday, labelled `Mon`…`Sun`; `monthly` →
one daily bucket per day of the reference calendar month, labelled by day number; `yearly` → 12 monthly
buckets across the reference calendar year, labelled `Jan`…`Dec`. Only the weekly label format has a live
fixture (`__tests__/insights.test.tsx`); monthly/yearly are `tickets/F5.md`'s own, undisputed but
unverified-against-a-fixture, choice.

**`from`/`to` default to the Unix epoch and "now" (i.e. unbounded) when omitted**, on `overview`,
`by-category`, and `top-days` alike — the shipped frontend always supplies both in practice, so this path
has no live evidence either way; see `tickets/F5.md`'s Decisions table.

**`top-days` and `budget-vs-actual`'s "spend"/"actual" both mean expense-only** (`isIncome: false`),
matching `budgets.service.ts`'s own definition of spend. `budget-vs-actual` reuses `listBudgets` (Feature
3) for the underlying computation but maps its rows into a narrower shape than `GET /api/budgets` returns
— no `category`, `daysRemaining`, `periodStart`/`periodEnd`, and `amount` renamed `allocated`.
