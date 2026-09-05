# SOW — Statement of Work

> **Approved 2026-09-04.** Drafted by Claude at the user's request ("draft it for you to bless"), for
> a solo project with no separate client/practitioner split; confirmed as-is by the user.

## Phase boundary: `001-merge-backend-into-nextjs`

**In scope:** Fold the standalone `dime-api` (Fastify) backend into `dime-web` (Next.js) so the app
ships as a single deployable on Kuberns, with no separately-hosted backend process. This covers:

- Every existing `dime-api` REST endpoint (~40, across health/auth/categories/transactions/budgets/
  analytics/ledger/templates/csv) re-implemented as Next.js Route Handlers with equivalent behavior.
- The Prisma schema and data becoming `dime-web`'s own (schema + migrations copied in).
- Cross-cutting backend concerns (auth verification, rate limiting, error responses, CSV
  streaming/multipart handling) rebuilt for the Next.js runtime, per the architecture decisions in
  `docs/decisions/001-merge-backend-into-nextjs.md`.
- Keeping `dime-api` running as a live fallback throughout the transition (per the user's explicit
  choice), with its eventual archive/delete decided only after full cutover is verified.

**Out of scope:** Any change to product behavior or existing features' functionality. No new features.
No change to the auth model beyond where tokens are issued/verified from (bearer-JWT-in-header is kept
as-is, per the user's explicit choice). No UI changes beyond what's strictly required by a changed API
base URL or error-shape standardization (see the decision doc for the one known frontend touch-point,
`components/settings/AccountForm.tsx`).

**Not decided by this phase:** whether/when to switch auth transport to cookies, whether/when to
archive or delete `dime-api`, whether to enable Kuberns' horizontal scaling. These are named as
deliberately deferred, not silently dropped.

## Owner

Solo project — the user is both practitioner and scope owner. No external client.
