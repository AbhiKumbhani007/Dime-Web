# Tasks — Phase 001: Merge dime-api into dime-web

Cut from `phases/001-merge-backend-into-nextjs/tdd.md`. IDs are repo-global (this is the first phase
cut in this repo — no earlier `phases/*/tasks.md` exists to collide with).

`node scripts/board.mjs` (npm script: `npm run board`) generates `dag-board.html` for this phase from
the task list below — see `phases/001-merge-backend-into-nextjs/dag-board.html` once generated. The
manual dry-run below (three tasks, four questions each) was done before that tooling was wired in and
stands as the completeness check either way.

## Feature 0: Foundational — shared plumbing every module needs

- [x] T001 [P] Add backend-port dependencies: `prisma`, `@prisma/client`, `jose`, `bcryptjs`, `csv-parse`, `server-only` — pin every version against the npm registry at implementation time, not from this document `package.json`
- [x] T002 Copy Prisma schema + migration history from `dime-api`; add the `RateLimitBucket` model and its own additive migration; point `dime-web`'s `.env.local` `DATABASE_URL`/`JWT_ACCESS_SECRET` at the same values `dime-api`'s `.env` already uses (same physical database — confirm with `prisma migrate status` showing zero drift before and after) `prisma/schema.prisma`, `prisma/migrations/20260405104227_init/`, `prisma/migrations/20260902210852_template_emoji_category_usage/`, `prisma/migrations/<timestamp>_add_rate_limit_bucket/` (after T001)
- [x] T003 Add the Next.js Prisma client singleton, exported as `prisma` `lib/server/prisma.ts` (after T002)
- [x] T004 [P] [TEST] Add the error-response helper and its fixed status→code enum (400/401/404/409/429/500) `lib/server/errorResponse.ts`, `lib/server/errorResponse.test.ts`
- [x] T005 [TEST] Add the Postgres-backed rate limiter (fixed-window counter against `RateLimitBucket`, `x-forwarded-for` key, opportunistic cleanup of rows older than 1h) `lib/server/rateLimit.ts`, `lib/server/rateLimit.test.ts` (after T002, T003)
- [x] T006 [P] [TEST] Add the bearer-token auth helper (verifies via `jose`, same `JWT_ACCESS_SECRET`/HS256/`{userId,email}` payload dime-api uses) `lib/server/auth/authenticate.ts`, `lib/server/auth/authenticate.test.ts` (after T001)
- [x] T007 [P] Copy small shared utilities: `httpError.ts` (verbatim), `defaultCategories.ts` (verbatim), `common.schema.ts` (Zod v3→v4 syntax updated) `lib/server/httpError.ts`, `lib/server/defaultCategories.ts`, `lib/server/common.schema.ts` (after T002)
- [x] T008 [P] Add the `/health` → `/api/health` rewrite (Kuberns' exact health-check path convention is an open question — this covers both without guessing) `next.config.ts`

**Checkpoint:** shared plumbing (Prisma, error shape, rate limiting, auth verification, small utilities) exists and is unit-tested. Nothing product-facing yet — no route handler exists.

## Feature 1: Pilot — Health & Categories

Chosen as the pilot per the TDD's own sequencing rationale: smallest surface, exercises every piece of
Foundational plumbing against a real module before the rest proceed in parallel.

- [x] T009 [P] [US1] [TEST] Port categories service + schema + tests (near-verbatim — `categories.service.ts` takes `prisma` as a plain argument, no framework coupling) `lib/server/categories/categories.service.ts`, `lib/server/categories/categories.schema.ts`, `lib/server/categories/categories.service.test.ts` (after T007)
- [x] T010 [US1] [TEST] Implement health + categories route handlers and their contract tests — `GET /api/health`, `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`; preserve the live-verified `{categories: [...]}` envelope (not a bare array) `app/api/health/route.ts`, `app/api/categories/route.ts`, `app/api/categories/[id]/route.ts`, `app/api/health/route.test.ts`, `app/api/categories/categories.routes.test.ts` (after T003, T004, T005, T006, T009)

**Checkpoint:** dime-web serves `/api/health` and every `/api/categories*` endpoint with contract parity
to dime-api, including the F0 rate limiter now wired in (`/api/categories*` limited, `/api/health`
exempt) — verified by `categories.routes.test.ts`/`health/route.test.ts` plus a manual curl session
against a running dime-web dev server (see `phases/001-merge-backend-into-nextjs/tickets/F1.md`). Every
shared-plumbing piece has now been exercised by a real, deployed route for the first time. **Corrected
during F1**: the original checkpoint named `e2e/categories.spec.ts` pointed at dime-web, which turned
out to be infeasible until auth is ported in Feature 7 (see `tdd.md`'s "Done for this phase" list and
`LEARNINGS.md`) — that retarget is `T027`'s job.

## Feature 2: Transactions

- [x] T011 [P] [US2] [TEST] Port transactions service + schema + tests `lib/server/transactions/transactions.service.ts`, `lib/server/transactions/transactions.schema.ts`, `lib/server/transactions/transactions.service.test.ts` (after T007, T010)
- [x] T012 [P] [US2] [TEST] Implement transactions route handlers + tests — `GET/POST /api/transactions`, `GET/PATCH/DELETE /api/transactions/:id`; preserve the live-verified `{items, nextCursor}` envelope `app/api/transactions/route.ts`, `app/api/transactions/[id]/route.ts`, `app/api/transactions/transactions.routes.test.ts` (after T003, T004, T005, T006, T011)

**Checkpoint:** transactions are fully served by dime-web, including the optional `templateId` usage-bump
side effect, cursor pagination, and category-ownership validation — verified by
`transactions.service.test.ts`/`transactions.routes.test.ts` plus a manual curl session against a running
dime-web dev server, including a live `templateId` usage-bump check (see
`phases/001-merge-backend-into-nextjs/tickets/F2.md`). **Corrected during F2**: the single-transaction
`POST`/`GET :id`/`PATCH` envelope is `{transaction}` (wrapped), not the bare `Transaction` `tdd.md`
originally documented — the identical class of correction F1 made for categories.

## Feature 3: Budgets

- [x] T013 [P] [US3] [TEST] Port budgets service + period helper + schema + tests `lib/server/budgets/budgets.service.ts`, `lib/server/budgets/budgets.period.ts`, `lib/server/budgets/budgets.schema.ts`, `lib/server/budgets/budgets.service.test.ts`, `lib/server/budgets/budgets.period.test.ts` (after T007, T010)
- [x] T014 [P] [US3] [TEST] Implement budgets route handlers + tests — `GET/POST /api/budgets`, `PATCH/DELETE /api/budgets/:id`, `GET /api/budgets/:id/progress`; preserve the live-verified `{budgets: [...]}` envelope and the `colour` (British spelling) field name `app/api/budgets/route.ts`, `app/api/budgets/[id]/route.ts`, `app/api/budgets/[id]/progress/route.ts`, `app/api/budgets/budgets.routes.test.ts` (after T003, T004, T005, T006, T013)

**Checkpoint:** budgets, including computed per-period progress, are fully served by dime-web.

## Feature 4: Templates

- [x] T015 [P] [US4] [TEST] Port templates service + schema + tests `lib/server/templates/templates.service.ts`, `lib/server/templates/templates.schema.ts`, `lib/server/templates/templates.service.test.ts` (after T007, T010)
- [x] T016 [P] [US4] [TEST] Implement templates route handlers + tests — `GET/POST /api/templates`, `PATCH/DELETE /api/templates/:id`; preserve the live-verified `{templates: [...]}` envelope `app/api/templates/route.ts`, `app/api/templates/[id]/route.ts`, `app/api/templates/templates.routes.test.ts` (after T003, T004, T005, T006, T015)

**Checkpoint:** templates (quick-add chips) are fully served by dime-web — verified by
`templates.service.test.ts`/`templates.routes.test.ts` plus a manual curl session against a running
dime-web dev server (see `phases/001-merge-backend-into-nextjs/tickets/F4.md`). **Corrected during F4**:
the `POST`/`PATCH` envelope is `{template}` (wrapped), not the bare `Template` `tdd.md` originally
documented — the identical class of correction F1 made for categories and F2 made for transactions.

## Feature 5: Analytics

- [x] T017 [P] [US5] [TEST] Port analytics service + period helper + tests (read-only) `lib/server/analytics/analytics.service.ts`, `lib/server/analytics/analytics.period.ts`, `lib/server/analytics/analytics.service.test.ts`, `lib/server/analytics/analytics.period.test.ts` (after T007, T010)
- [x] T018 [P] [US5] [TEST] Implement the 6 analytics route handlers + tests — `overview`, `by-period`, `by-category`, `trends`, `top-days`, `budget-vs-actual`; the last reuses budgets' `listBudgets`, so it needs the budgets service, not just its own `app/api/analytics/overview/route.ts`, `app/api/analytics/by-period/route.ts`, `app/api/analytics/by-category/route.ts`, `app/api/analytics/trends/route.ts`, `app/api/analytics/top-days/route.ts`, `app/api/analytics/budget-vs-actual/route.ts`, `app/api/analytics/analytics.routes.test.ts` (after T003, T004, T005, T006, T013, T017)

**Checkpoint:** every analytics view (insights screen) is fully served by dime-web. **Corrected during
F5**: `tdd.md`'s `by-period` contract row documented query params `bucket,from?,to?` and left the response
shape vague ("series array") — actual shipped contract is `period,date?,categoryId?` in, and a flat
`{period,labels,income,expense,net,from,to}` object out, matching `lib/api/analytics.ts`'s already-shipped
`getByPeriod`/`ByPeriodResult`. Same class of "TDD documented the wrong shape" correction F1 through F4 each
made once for their own module.

## Feature 6: Ledger

- [x] T019 [P] [US6] [TEST] Port ledger service + balance helper + schema + tests `lib/server/ledger/ledger.service.ts`, `lib/server/ledger/ledger.balance.ts`, `lib/server/ledger/ledger.schema.ts`, `lib/server/ledger/ledger.service.test.ts`, `lib/server/ledger/ledger.balance.test.ts` (after T007, T010)
- [x] T020 [P] [US6] [TEST] Implement ledger route handlers + tests — people CRUD, entries CRUD, settle-all with its optimistic-concurrency `expectedBalance` check (preserve exactly — the one explicit concurrency guard in this API); preserve the live-verified `{people, summary}` envelope `app/api/ledger/people/route.ts`, `app/api/ledger/people/[id]/route.ts`, `app/api/ledger/people/[id]/entries/route.ts`, `app/api/ledger/people/[id]/settle/route.ts`, `app/api/ledger/entries/[id]/route.ts`, `app/api/ledger/ledger.routes.test.ts` (after T003, T004, T005, T006, T019)

**Checkpoint:** the IOU ledger, including settlement, is fully served by dime-web.

## Feature 7: Auth

Sequenced deliberately after the other product modules (per the TDD's Architecture table): this is the
one service that is a real rewrite, not a copy, and it's the highest-risk piece to get wrong. Other
modules don't need Auth's own routes to be portable first — they only need the Foundational
`authenticate` helper (T006), which verifies any valid bearer token regardless of which system issued
it, since dime-web and dime-api share the same `JWT_ACCESS_SECRET`.

- [X] T021 [P] [US7] [TEST] Rewrite the auth service for Next.js — inject `prisma` directly instead of `fastify.prisma`, replace `fastify.jwt.sign()`/verification with `jose`, keep bcrypt hashing and the Google `tokeninfo` call unchanged; port schema + tests `lib/server/auth/auth.service.ts`, `lib/server/auth/auth.schema.ts`, `lib/server/auth/auth.service.test.ts` (after T001, T002, T007, T010)
- [X] T022 [P] [US7] [TEST] Implement the 7 auth route handlers + tests — register, login, refresh, logout, `me` (GET/PATCH/DELETE), `me/password`, google; preserve the live-verified flat `{accessToken,refreshToken,user}` envelope on register/login/google `app/api/auth/register/route.ts`, `app/api/auth/login/route.ts`, `app/api/auth/refresh/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`, `app/api/auth/me/password/route.ts`, `app/api/auth/google/route.ts`, `app/api/auth/auth.routes.test.ts` (after T003, T004, T005, T006, T021)

**Checkpoint:** dime-web can register, log in, refresh, and manage a user's own account entirely on its own routes — the last piece needed before the frontend can be cut over to same-origin.

## Feature 8: CSV import/export

Last, per the TDD's Architecture table: the most Fastify-specific plumbing to rebuild (multipart,
streaming), so it benefits most from every other module's route pattern already being proven.

- [X] T023 [P] [US8] [TEST] Port csv service + row-parsing + token helpers + schema + tests `lib/server/csv/csv.service.ts`, `lib/server/csv/csv.parse.ts`, `lib/server/csv/csv.token.ts`, `lib/server/csv/csv.schema.ts`, `lib/server/csv/csv.service.test.ts`, `lib/server/csv/csv.parse.test.ts`, `lib/server/csv/csv.token.test.ts` (after T007, T010)
- [X] T024 [US8] [TEST] Implement csv route handlers + tests — export (buffer `exportRows()` in memory via `for await`, preserve the exact live-verified headers/UTF-8 BOM/`Content-Disposition` byte-for-byte), import/preview and import/commit (Web `Request.formData()`/`File`, size-checked before reading bytes) `app/api/csv/export/route.ts`, `app/api/csv/import/preview/route.ts`, `app/api/csv/import/commit/route.ts`, `app/api/csv/csv.routes.test.ts` (after T003, T004, T005, T006, T023)

**Checkpoint:** every one of dime-api's ~40 endpoints is now served by dime-web. dime-api is still running and still the frontend's configured backend — nothing user-facing has changed yet.

## Feature 9: Polish — frontend cutover & validation

- [ ] T025 [TEST] Update the one frontend file that depends on the old flat error shape now that `/api/auth/me/password` returns the standardized `{error:{code,message}}` shape `components/settings/AccountForm.tsx`, `__tests__/settings-account.test.tsx` (after T022)
- [ ] T026 Point dime-web's own client at itself — same-origin base URL, no more `NEXT_PUBLIC_API_URL` pointing at :4000 `lib/api.ts`, `components/providers/SessionProvider.tsx` (after T010, T012, T014, T016, T018, T020, T022, T024)
- [ ] T027 Retarget e2e helpers to same-origin and drop the `dime-api` `webServer` entry `e2e/helpers/api.ts`, `playwright.config.ts` (after T026)
- [ ] T028 [TEST] Final validation — run every existing Vitest suite and the full Playwright suite against dime-web alone; confirm every item in the TDD's "Done for this phase" list is demonstrated and no stub/`501` remains `phases/001-merge-backend-into-nextjs/tdd.md#testing-and-done` (after T025, T026, T027)

**Checkpoint:** dime-web is a single deployable. dime-api is no longer in dime-web's request path (still running, per the user's choice, as a fallback — see `docs/decisions/001-merge-backend-into-nextjs.md` for its own, separately-decided fate).

---

## Dry-run (per the `cut` skill's own bar, since `bun run board` isn't available)

**T004 (foundational) — `lib/server/errorResponse.ts`**

1. Files: `lib/server/errorResponse.ts`, `lib/server/errorResponse.test.ts` — both named in the TDD's project structure. ✓
2. Exact signature and status→code table are in the TDD's Architecture row "Error `code` values". ✓
3. Verified by its own colocated test, asserting each status produces its documented code + the message passed through. ✓
4. Wrong input: none meaningful — it's a pure formatting function; TypeScript's status-union type is the guard. ✓

**T014 (mid-stack) — budgets route handlers**

1. Files named exactly in both the TDD's project structure and this task. ✓
2. Request/response shapes, status codes, and the `colour` field-name gotcha are all in the TDD's API contracts table + `LEARNINGS.md`. ✓
3. Verified by `budgets.routes.test.ts`, asserting the documented envelope and status codes per case. ✓
4. Wrong/missing category reference → `404`; invalid body → `400` with the standardized shape (both named in the contracts table). ✓

**T024 (edge) — csv route handlers**

1. Files named exactly in both documents. ✓
2. Exact headers, BOM, buffering approach, and the `429` rate-limit-exceeded shape are all specified (the BOM/headers are live-verified; the `429` shape is explicitly flagged in the TDD as designed-not-observed, which is itself the correct, honest answer — not a hole). ✓
3. Verified by `csv.routes.test.ts` against the committed fixture `fixtures/csv-export-sample.csv` for byte-for-byte header/BOM parity. ✓
4. Oversized/invalid CSV file → `400` before any bytes are read (checked via `File.size`, per the TDD's CSV import multipart decision); expired/mismatched preview token → `400` (re-verified server-side, not trusted from the client). ✓

All three survive.
