# Learnings

Things worth knowing before touching this codebase. `ticket`/`tdd` read this before asking questions
— add to it rather than re-explaining the same gotcha in a PR description.

## Backend merge (dime-api → dime-web)

- **Three inconsistent API error shapes exist in `dime-api` today** (flat `{error: string}` in most
  route handlers vs structured `{error:{code,message}}` in the auth preHandler and the global error
  handler) — documented in `../TDD-PAISA.md` §3.1. Exactly one frontend file currently depends on the
  flat shape: `components/settings/AccountForm.tsx` (see its `FlatApiError` type and inline comment).
  The merge phase standardizes on the structured shape everywhere and updates that one file — this is
  a deliberate, named exception to `TDD-PAISA.md`'s "don't reconcile this opportunistically" caution,
  because the merge rewrites every route handler anyway.
- **Zod major-version split**: `dime-api` is on Zod v3, `dime-web` is already on Zod v4. Ported schemas
  standardize on v4; verify the v4 API surface against the actually-installed package when porting,
  not from memory (`z.string().cuid()`, `invalid_type_error`, `errorMap`, error-array access all
  changed shape between majors).
- **Money is stored as `Float` in Prisma** (`dime-api/prisma/schema.prisma`'s `Transaction.amount` /
  `Budget.amount`), not `Decimal` — a known precision risk flagged in `../TDD-PAISA.md` §11. Not fixed
  by the merge; carried over as-is unless a future phase addresses it explicitly.
- **British spelling**: `Budget.colour` (not `color`) in the Prisma schema — `Category.color` uses the
  American spelling. Inconsistent, but changing either is a breaking schema change; leave as-is unless
  a phase explicitly takes it on.
- **Dead env vars in dime-api**: `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRY` are declared in
  `dime-api/.env.example` and its zod config schema but never referenced in `src/` — refresh tokens
  are opaque DB rows (`RefreshToken.token`, a `crypto.randomUUID()`), not JWTs. Don't port these vars.
- **`dime-api/src/modules/auth/auth.service.ts` is the one service coupled to its framework** — every
  other `*.service.ts` takes `prisma` as a plain argument (framework-agnostic, copies near-verbatim);
  `auth.service.ts` takes `fastify: FastifyInstance` and calls `fastify.prisma.*`/`fastify.jwt.sign()`
  directly throughout. It needs a real rewrite during the port, not a copy.
- **`server-only` throws under Vitest unless aliased.** Next.js's webpack build resolves the
  `server-only` package to its no-op `empty.js` via the `react-server` resolve condition; Vitest
  doesn't set that condition by default, so every `lib/server/*` file's `import 'server-only'` throws
  immediately under test. Fixed once, globally, via `resolve.alias` in `vitest.config.ts` mapping
  `server-only` → `node_modules/server-only/empty.js`. No per-test-file workaround needed.
- **`dime-api` does not actually key its rate limiter on `x-forwarded-for`** — its `@fastify/rate-limit`
  registration sets no `trustProxy`/custom `keyGenerator`, so it uses Fastify's socket-derived
  `request.ip`. `dime-web`'s Postgres-backed limiter (`lib/server/rateLimit.ts`) still needs
  `x-forwarded-for` regardless — Kuberns sits in front as a reverse proxy, so the raw socket IP a
  Route Handler sees would be the proxy's, not the real client's. Found during Feature 0's review;
  corrected in `tdd.md`'s Architecture table rather than left as a stale "matches dime-api" claim.
- **`jose`'s WebCrypto key handling fails under jsdom** — `SignJWT`/`jwtVerify` throw
  `"Key for the HS256 algorithm must be one of type CryptoKey, KeyObject, JSON Web Key, or
Uint8Array. Received an instance of Uint8Array"` when run in Vitest's default `jsdom` environment,
  because jsdom's `Uint8Array`/crypto globals are a different realm than Node's and fail jose's
  `instanceof` checks. `lib/server/**` code targets the Node runtime anyway (per `tdd.md`'s Context
  table), so any test file that imports `jose` (or anything that transitively does) needs
  `// @vitest-environment node` as its first line — this repo has no global `node` environment
  carve-out, so it's per-file, not automatic.
- **Zod v4 renamed `SafeParseError.error.errors` to `.issues`.** `dime-api`'s route handlers read
  `parsed.error.errors[0]?.message` — under the installed `zod@4.3.6`, `.errors` is `undefined`, so a
  naive port turns every 400-validation path into an unhandled `TypeError` (a 500). Also note: v4's
  _default_ message for a missing required field differs from the v3 fixture captured in
  `phases/001-merge-backend-into-nextjs/fixtures/README.md` (`"Required"` → a longer v4 default like
  `"Invalid input: expected string, received undefined"`); status codes, envelopes, and every
  **custom** validation message (`.min(1, '...')`, `.regex(..., '...')`) are unaffected — this is a
  library-version difference, not a port regression.
- **`tdd.md`'s API contracts table had the same "documented as bare, actually wrapped" mistake for
  budgets that F1 already found and fixed for categories** — `POST`/`PATCH /api/budgets*` were
  documented as returning a bare `Budget`, and `GET /api/budgets/:id/progress` as a bare
  `BudgetProgress`. Live-verified (real `curl` against a running `dime-web` dev server) during F3: both
  are wrapped/nested exactly like `dime-api`'s source and `dime-web`'s already-shipped `lib/api/budgets.ts`
  predicted — `{budget: Budget}` for POST/PATCH, and progress merges `budget` in alongside the flat
  `spent`/`remaining`/`percent`/`daysRemaining`/`periodStart`/`periodEnd` fields. Worth checking this
  same "bare vs. wrapped" class of error on every remaining un-ported module's contract-table row before
  trusting it.
- **`e2e/categories.spec.ts:50`'s `expect(body.error).toMatch(/used/i)` assumes the old flat error
  shape** (`{error: "..."}`). Once a route returns the standardized `{error:{code,message}}` envelope,
  `body.error` is an object and `toMatch` fails — the assertion needs to become
  `expect(body.error.message).toMatch(/used/i)`. Not fixed yet: this spec still runs entirely against
  `dime-api` (unaffected today) and is only retargeted at `dime-web` in `T027`, after auth is ported in
  Feature 7 — recorded here now so the fix isn't rediscovered from a red CI run later.
- **Zod v4's `z.enum(values, {errorMap})` silently no-ops instead of throwing.** `dime-api`'s v3-era
  `SortQuerySchema` (templates' `sort` query param) attaches a custom invalid-value message via
  `{errorMap: () => ({message: '...'})}`. Under the installed `zod@4.3.6` this doesn't error — it just
  discards the custom message and falls back to v4's generic `"Invalid option: expected one of ..."`.
  Confirmed directly with `node -e`. The v4 equivalent is the top-level `{error: '...'}` option (the
  same API `AmountSchema` in `common.schema.ts` already uses). Unlike the `.errors`→`.issues` rename
  above, this doesn't throw or fail a naive port's tests unless the test asserts the actual message
  text, not just pass/fail — write that assertion for any v3→v4 enum port.

- **`dime-api` reachability depends on the execution environment, not on the repo** — F5's session had no
  sibling `dime-api` checkout (confirmed via `list_repos`) and fell back to `dime-web`'s own already-shipped
  frontend client/hooks/tests as the substitute "live system" for any contract `tdd.md` left vague. F6's
  session, on a different host, had a running `dime-api` checkout at `../dime-api` with its dev server live
  on `:4000` — read directly as the primary port source. Don't assume either way from a prior ticket's
  session; check `list_repos`/the filesystem at the start of each ticket instead. Either substitute is
  valid; dime-web's shipped frontend client remains a useful cross-check even when dime-api is reachable
  (both agreed exactly, for every ledger envelope, during F6).
- **Prisma's `groupBy` resolves `_count: true` to a plain `number` per group** — confirmed against the
  generated `.prisma/client` types (`TransactionGroupByOutputType`'s conditional type: `P extends '_count'
? T[P] extends boolean ? number : ...`). This differs from `aggregate()`, where `_count: true` also
  yields a number, but a _field-scoped_ form (`_count: {someField: true}`) yields an object either way —
  worth re-checking the generated types rather than assuming, same spirit as this file's other Zod/Prisma
  version-surface entries.
- **`tdd.md`'s project structure tree for `analytics/` omitted `analytics.schema.ts`** — every other
  ported module lists its own `*.schema.ts` there; analytics needs one too (six endpoints' query params).
  Added during F5.
- **Zod v4's `z.number()` already rejects `Infinity`/`NaN` at the base type check**, before any
  `.finite(message)`/`.refine(...)` chained after it ever runs — confirmed live via `node -e` against the
  installed `zod@4.3.6`. A v3-authored custom message on `.finite(...)` (e.g. ledger's
  `SettleBodySchema`'s `expectedBalance: z.number().finite('expectedBalance must be a finite number')`,
  ported near-verbatim from `dime-api`) never actually surfaces — the rejection still happens (400s
  correctly), but with v4's generic `"Invalid input: expected number, received Infinity"`-shaped message
  instead. Same class as the already-documented `errorMap`/`.min(1, msg)` v3→v4 message quirks; write the
  test to assert `success === false` only, not the literal message, for any ported `.finite()`/`Infinity`-
  adjacent check. Found during F6.
- **`dime-api`'s global `@fastify/rate-limit` registration has no per-route exemption for `auth.routes.ts`**
  (confirmed against the live `dime-api/src/server.ts` — contrast `csv.routes.ts`'s explicit per-route
  override on export) — all 7 ported auth routes go through the same `checkGlobalRateLimit` every other
  module uses. Worth checking per-route rate-limit overrides in the live source for any not-yet-ported
  module before assuming the global default applies uniformly.
- **Zod v4's top-level `z.email(...)` replaces the deprecated `z.string().email()`**, same deprecation
  pattern already noted here for `z.cuid()` vs `z.string().cuid()`. Used in `auth.schema.ts` (F7) for
  consistency with every other ported schema's cuid usage; `common.schema.ts` still uses the deprecated
  chained form and wasn't touched (out of scope for the feature that found this).
- **`Response.text()`'s `TextDecoder` strips a leading UTF-8 BOM (`U+FEFF`) by default** — a route test
  that asserts the CSV export's leading-BOM byte via `(await response.text()).charCodeAt(0)` will always
  see the first *content* character instead and fail, even though the actual wire bytes `new Response(body,
  ...)` sends are correct (`TextEncoder`, used on the write side, does not strip anything — only decoding
  does). Read `await response.arrayBuffer()` and check the raw bytes (`0xef, 0xbb, 0xbf`) instead. Found
  while writing `app/api/csv/csv.routes.test.ts` during F8 — the same gotcha would silently hide a real BOM
  regression in any future route that emits one.

## Tooling

- **No devx-starter scaffold tooling exists in this repo** — only `.claude/skills/` was installed
  (`chore(claude): install devx-starter skills for manual use`), not the starter's own
  `scripts/setup.mjs`/`scripts/verify.mjs`/commitlint/husky infrastructure. `AGENTS.md`, this file,
  `scripts/verify.mjs`, and the five gate scripts in `package.json` were authored by hand to match
  what the `setup` skill expects, not generated by a `bun run setup` command (there isn't one).
- **`format:check` and `lint` are wired but not currently green.** `prettier` was never run on this
  codebase before — `npm run format:check` currently flags ~156 files. `eslint` currently reports 5
  pre-existing errors: 2 in `e2e/fixtures.ts` are a known false-positive class (`react-hooks/rules-of-hooks`
  misfiring on Playwright's `use` fixture pattern, which is unrelated to React hooks), 2 are real
  pre-existing issues in `components/insights/TrendsChart.tsx` and
  `components/providers/SessionProvider.tsx`, unrelated to any change made during this setup pass.
  None of this was auto-fixed here — a `prettier --write .` across the whole tree is a real, reviewable
  diff and belongs in its own commit, not folded silently into project setup.
- **`@vitest/coverage-v8` must be pinned to the exact same version as `vitest`** (currently `4.1.2`,
  not a caret range) — a version-range mismatch here (e.g. `^4.1.2` resolving to a newer `4.1.x`) hits
  an npm 10.9.7 arborist bug (`Cannot read properties of null (reading 'edgesOut')`) during
  `npm install`. Exact-pinning both resolved it; don't loosen the coverage package's version range.
