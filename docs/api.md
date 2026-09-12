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
`crypto.randomUUID()` values stored in `RefreshToken` with a 30-day expiry, rotated on every
`/api/auth/refresh` call — rotation now marks the old row `revokedAt` rather than deleting it (see the
Reuse detection note below), and it's opportunistically purged ~24h later.

**Reuse detection / session-family revocation (security hardening added after the initial port).**
Presenting a refresh token whose row already has `revokedAt` set (i.e. it was already rotated out by an
earlier call) is treated as a possible stolen-token replay: the ENTIRE session family — every `RefreshToken`
row for that user — is revoked (deleted), and the request gets the same `401`. This is intentionally
narrower than it sounds: two requests that both race to rotate the *same still-current* token (an honest
concurrent double-fire, e.g. a flaky client retry) do **not** trigger this cascade — only one wins an atomic
claim and the loser gets a plain `401`, exactly as before; the cascade is reserved for a token that was
*already* rotated by a distinct, earlier call. See `lib/server/auth/auth.service.ts`'s `refreshTokens` for
the exact algorithm and `lib/server/auth/auth.refresh-reuse.security.test.ts` /
`app/api/auth/auth.concurrency.live.test.ts` for the tests distinguishing the two cases.

| Method | Path                    | Auth | Request body                     | Success                                          | Errors                                                                 |
| ------ | ----------------------- | ---- | --------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/auth/register`    | none | `{ email, password, name? }`      | `201 { accessToken, refreshToken, user }` (flat)  | `400` (validation), `409` (email already registered), `429`             |
| POST   | `/api/auth/login`       | none | `{ email, password }`             | `200 { accessToken, refreshToken, user }` (flat)  | `400` (validation), `401` (invalid email/password), `429`               |
| POST   | `/api/auth/refresh`     | none | `{ refreshToken }`                | `200 { accessToken, refreshToken }` (rotated)     | `400` (validation), `401` (invalid/expired/already-used token — reuse of an already-rotated token additionally revokes the caller's whole session family, see above), `429` |
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

| Method | Path                              | Request                                                      | Success                                                                                                              | Errors                                          |
| ------ | --------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| GET    | `/api/analytics/overview`         | query: `from?, to?`                                          | `200` flat `{totalIncome, totalExpense, netBalance, transactionCount, avgDailySpend, from, to}`                      | `400` (bad date), `401`, `429`                  |
| GET    | `/api/analytics/by-period`        | query: `period(weekly\|monthly\|yearly), date?, categoryId?` | `200` flat `{period, labels: string[], income: number[], expense: number[], net: number[], from, to}`                | `400` (bad `period`/`categoryId`), `401`, `429` |
| GET    | `/api/analytics/by-category`      | query: `from?, to?, isIncome?`                               | `200 { categories: CategoryBreakdownRow[] }` — each `{category: {id,name,emoji,color}\|null, total, percent, count}` | `400` (bad date), `401`, `429`                  |
| GET    | `/api/analytics/trends`           | query: `months?(default 6, max 36)`                          | `200 { trends: TrendRow[] }` — each `{month: "YYYY-MM", income, expense, net}`, oldest first                         | `400` (bad `months`), `401`, `429`              |
| GET    | `/api/analytics/top-days`         | query: `from?, to?, limit?(default 10, max 100)`             | `200 { days: TopDayRow[] }` — each `{date: "YYYY-MM-DD", total}`, expense-only, sorted descending                    | `400` (bad date/`limit`), `401`, `429`          |
| GET    | `/api/analytics/budget-vs-actual` | —                                                            | `200 { budgets: BudgetVsActualRow[] }` — each `{budget: {id,name,emoji,type}, allocated, spent, remaining, percent}` | `401`, `429`                                    |

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
matching `budgets.service.ts`'s own definition of spend. `budget-vs-actual` reuses `listBudgets` (Feature 3) for the underlying computation but maps its rows into a narrower shape than `GET /api/budgets` returns
— no `category`, `daysRemaining`, `periodStart`/`periodEnd`, and `amount` renamed `allocated`.

## Ledger

All ten endpoints require a bearer token and are subject to the global rate limit, same as Categories.
`LedgerPersonWithBalance` adds five computed fields (`balance`, `direction`, `activeEntryCount`,
`settledEntryCount`, `lastActivityAt`) on top of the stored `LedgerPerson` row — every response below that
includes a person returns this computed shape, never the bare stored row.

| Method | Path                             | Request body                                                      | Success                                                                                                             | Errors                                                                        |
| ------ | -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/ledger/people`             | —                                                                 | `200 { people: LedgerPersonWithBalance[], summary: LedgerSummary }`                                                 | `401`, `429`                                                                  |
| POST   | `/api/ledger/people`             | `{ name, phone?, note?, color? }` (`color` defaults to `#6366f1`) | `201 { person: LedgerPersonWithBalance }`                                                                           | `400` (validation), `401`, `409` (duplicate name, case-insensitive), `429`    |
| GET    | `/api/ledger/people/:id`         | —                                                                 | `200 { person: LedgerPersonWithBalance }`                                                                           | `400` (invalid id), `401`, `404`, `429`                                       |
| PATCH  | `/api/ledger/people/:id`         | partial `{ name?, phone?, note?, color? }`                        | `200 { person: LedgerPersonWithBalance }`                                                                           | `400` (invalid id or empty body), `401`, `404`, `409` (duplicate name), `429` |
| DELETE | `/api/ledger/people/:id`         | —                                                                 | `204` (no body — cascades the person's entries)                                                                     | `400` (invalid id), `401`, `404`, `429`                                       |
| GET    | `/api/ledger/people/:id/entries` | —                                                                 | `200 { person: LedgerPersonWithBalance, active: LedgerEntry[], settled: LedgerEntry[] }`                            | `400` (invalid id), `401`, `404`, `429`                                       |
| POST   | `/api/ledger/people/:id/entries` | `{ amount, type("GAVE"\|"RECEIVED"), date, note? }`               | `201 { entry: LedgerEntry, person: LedgerPersonWithBalance }`                                                       | `400` (validation), `401`, `404` (person not owned), `429`                    |
| PATCH  | `/api/ledger/entries/:id`        | partial `{ amount?, type?, date?, note?, settled? }`              | `200 { entry: LedgerEntry, person: LedgerPersonWithBalance }`                                                       | `400` (invalid id or empty body), `401`, `404`, `429`                         |
| DELETE | `/api/ledger/entries/:id`        | —                                                                 | `204` (no body)                                                                                                     | `400` (invalid id), `401`, `404`, `429`                                       |
| POST   | `/api/ledger/people/:id/settle`  | `{ expectedBalance? }`                                            | `200 { person: LedgerPersonWithBalance, settledCount, settledAmount, settledAt }` — bulk-settles every active entry | `400` (invalid id), `401`, `404`, `409` (see below), `429`                    |

**Note on envelopes:** every response wrapping a person or entry uses a named key (`person`, `entry`) —
`POST`/`GET :id`/`PATCH /people/:id` and `POST`/`PATCH` on entries were originally documented in
`phases/001-merge-backend-into-nextjs/tdd.md` as returning the bare object; that was wrong (dime-api's
actual source and dime-web's already-shipped `lib/api/ledger.ts` both wrap it), corrected during F6 — the
same class of correction F1 through F4 each made once for their own module. Creating or updating an entry
additionally returns the affected `person` alongside the `entry`, recomputed through the same balance path
`GET /api/ledger/people` uses, so a client can update its list and detail caches without a refetch.

**`settle`'s `409` has two distinct, unrelated causes**, both preserved from `dime-api`: (1) there are zero
active (unsettled) entries for the person at all (`"No outstanding entries to settle"`), and (2) the
**optimistic-concurrency check** — a supplied `expectedBalance` doesn't match the person's current computed
balance (`"This balance changed — reopen the dialog and try again"`). The second is the one explicit
concurrency guard anywhere in this API: `expectedBalance` is optional, so a caller that doesn't send it
skips the check entirely and settles unconditionally. Both causes run inside one `$transaction`, so a
concurrent settle attempt can never partially apply.

**`GAVE` increases what the person owes you; `RECEIVED` decreases it** — `balance > 0` means they owe you,
`balance < 0` means you owe them, and values within half a paisa (`±0.005`) of zero read as `SETTLED`
(`direction`), guarding against `Float` accumulation error rather than representing a real amount.

**Every direct lookup is scoped by `userId`, not just `id`** (`ledgerPerson`/`ledgerEntry` `findFirst`, and
`computeBalances`'s underlying queries) — matches the defense-in-depth convention `2e58f9c` established for
this codebase, rather than relying on a write-time invariant.

## CSV

All three endpoints require a bearer token. `GET /api/csv/export` is subject to a **tighter** rate limit
than every other route (`RATE_LIMIT_CSV_EXPORT_MAX`, default 10/min — replaces the global limit for this
route, not in addition to it); `import/preview` and `import/commit` use the same global rate limit as
every other mutating route.

| Method | Path                      | Request                                                    | Success                                                                                                                           | Errors                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/csv/export`         | query: `from?, to?`                                          | `200`, `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="paisa-export-<yyyy-MM-dd>.csv"`, `Cache-Control: no-store`; body is a UTF-8 BOM then `Date,Amount,Type,Category,Note\r\n` then one CSV line per transaction — **no JSON envelope**, the only route in the API without one | `400` (bad `from`/`to`), `401`, `429`                                             |
| POST   | `/api/csv/import/preview` | multipart `file` (`.csv`, ≤2MB, size checked before any bytes are read) | `200 {previewToken, fileName, totalRows, readyCount, duplicateCount, errorCount, errors: ImportErrorRow[], errorsTruncated, duplicates, expiresAt}` — `previewToken` is a signed, 30-minute-TTL HMAC token, not a bearer/JWT token | `400` (no file, wrong extension, oversized, unparseable CSV, missing required column, >5000 rows), `401`, `429` |
| POST   | `/api/csv/import/commit`  | multipart `file` (same file previewed) + `previewToken`      | `201 {imported, skippedDuplicates, skippedErrors, totalRows, driftedFromPreview}` — bulk-inserts the ready rows in chunks of 500 inside one Prisma `$transaction` | `400` (no file, wrong extension, missing/malformed/expired/wrong-user `previewToken`), `401`, `409` (uploaded file's hash doesn't match the previewed file), `429` |

**`phases/001-merge-backend-into-nextjs/tdd.md`'s contracts table under-specified `import/preview`'s
response (glossed as `{previewToken, rows: [...]}`, which doesn't exist) and got `import/commit`'s status
codes wrong (documented as `200` success / `400` for a file-hash mismatch; the actual, `dime-api`-source-
and-test-confirmed values are `201` success / `409` for a hash mismatch)** — corrected during F8, same
class of "TDD documented the wrong shape" correction F1 through F5 each made once for their own module;
see `phases/001-merge-backend-into-nextjs/tickets/F8.md`'s Decisions table.

**Import is a two-step, stateless flow.** `commit` never trusts `preview`'s classification — it re-parses
and re-classifies the uploaded file from scratch (in case a transaction was added in between) and reports
`driftedFromPreview: true` when the recomputed ready/duplicate/error counts disagree with what the token
recorded. It also re-hashes the uploaded file and rejects (`409`) if it doesn't match the file that was
previewed, so a client can't preview one file and commit a different one under the same token.

**A row is never auto-created or fuzzy-matched against an existing category** — an unrecognized `Category`
value is always an `UNKNOWN_CATEGORY` error row, never a guess.
