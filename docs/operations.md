# Operations

Configuration and failure modes for running `dime-web`. Updated by whichever ticket changes
configuration, startup, deploy, or adds a new way the app can fail.

## Environment variables

| Variable                    | Required | Default | Notes                                                                                                                                                                                                                                          |
| --------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | yes      | —       | Postgres connection string — same physical database `dime-api` uses during the transition (see `phases/001-merge-backend-into-nextjs/tdd.md`).                                                                                                 |
| `JWT_ACCESS_SECRET`         | yes      | —       | HS256 signing secret for access tokens, verified via `jose`. Same value `dime-api` uses, so tokens issued by either system are valid on both during the transition.                                                                            |
| `RATE_LIMIT_MAX`            | no       | `100`   | Max requests per window for the global rate-limit group (`lib/server/rateLimit.ts`, keyed by `x-forwarded-for`). Applies to every `/api/categories*` route; `/api/health` is deliberately exempt (see Failure modes below).                    |
| `RATE_LIMIT_WINDOW_SECONDS` | no       | `60`    | Window length, in seconds, for the global rate limit. Introduced during Feature 1 — note this is a plain integer, unlike `dime-api`'s `RATE_LIMIT_WINDOW`, which is a Fastify duration string (`"1 minute"`); the two are not interchangeable. |

## Failure modes

| Symptom                                                              | Cause                                                                                                  | Response                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `429 { error: { code: "RATE_LIMITED", ... } }` on `/api/categories*` | Caller (by `x-forwarded-for` IP) exceeded `RATE_LIMIT_MAX` requests within `RATE_LIMIT_WINDOW_SECONDS` | Standard rate limiting — retry after the window elapses. `/api/health` is never rate-limited, so it's safe for Kuberns' health probes to poll on a fixed interval without risking a false-unhealthy signal. |
| `401 { error: { code: "UNAUTHORIZED", ... } }`                       | Missing/invalid/expired bearer token                                                                   | Client re-authenticates.                                                                                                                                                                                    |
