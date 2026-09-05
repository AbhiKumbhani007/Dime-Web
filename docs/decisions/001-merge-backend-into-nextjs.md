# Decision 001: Merge dime-api into dime-web

**Date:** 2026-09-04
**Status:** Decided
**Supersedes:** `../../../TDD.md` (root-level) §"Architecture" / §2 "Repository Structure" ("Two
separate repositories — `dime-api` (backend) + `dime-web` (frontend)", `TDD.md:6`) and
`../../../process.txt`'s 2026-04-05 decision log entry: *"Repo structure: Two separate git repos (not
a monorepo), exactly as specified in the TDD... Auth: JWT... No NextAuth/Auth.js — the backend is a
separate Fastify server, not a Next.js API route."*

## Decision

Fold `dime-api` (Fastify 5 + Prisma 6 + PostgreSQL, ~40 REST endpoints across 8 modules) directly into
`dime-web` (Next.js 16 App Router) as `app/api/*` Route Handlers backed by `lib/server/*`, so the
product ships as a single deployable with no separately-hosted backend process. `dime-api` keeps
running during the transition as a live fallback/rollback point; its ultimate fate (archive/delete) is
an explicit open follow-up, decided only after the full port is verified.

## Why the prior decision is being reversed

`TDD.md` (2026-03-31) chose the two-repo split deliberately, in reaction to an earlier proposal in
`../../../RESEARCH.md` that put everything inside Next.js API routes with a direct-Postgres sync layer
and no separate backend — i.e. close to what this decision now re-adopts. At the time, the two-repo
split was the considered choice; `process.txt` ratified it the same week (2026-04-05) alongside the
explicit auth-model consequence ("no NextAuth/Auth.js — the backend is a separate Fastify server").

That reasoning was sound for a two-service architecture under active parallel backend/frontend
development (per `process.txt`'s documented two-agent-per-feature workflow, one agent per repo). It
stops being the right tradeoff once the goal shifts to a single deployable with no separately-hosted
backend — at that point the split is pure overhead: two processes to run locally, two hosting
surfaces, a CORS layer serving no purpose once same-origin, and cross-repo coordination for every
change that touches both a route and its consumer.

## What does not change

- **Auth transport**: bearer JWT in the `Authorization` header, exactly as `process.txt` specified —
  this decision does not revisit that choice, only where the token is issued/verified from.
- **Data model**: the Prisma schema ports as the single source of truth for `dime-web`; no product
  behavior changes as a result of this decision.
- **API contract**: `lib/api/*.ts` function signatures and `hooks/*.ts` React Query usage are the
  frontend-side contract under test today (mocked directly in Vitest, not `fetch`) and are preserved.

## What does change

- Where the backend runs: from a standalone Fastify process to Next.js Route Handlers in this repo.
- Deployment target: `dime-api` no longer needs its own hosting; everything ships via Kuberns from
  this repository. See `phases/001-merge-backend-into-nextjs/tdd.md` for the full technical design
  (route layout, Prisma singleton pattern, rate-limiting approach, error-shape standardization, and
  the reuse-vs-rebuild breakdown).
