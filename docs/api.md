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
