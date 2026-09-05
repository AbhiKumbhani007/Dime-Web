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
