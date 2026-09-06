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
