# Dime Web

Next.js 16 App Router frontend for Dime, a personal expense tracker. As of the
`merge-backend-into-nextjs` phase, this repository is absorbing the standalone
`dime-api` Fastify backend so the whole app ships as a single deployable — see
`docs/decisions/001-merge-backend-into-nextjs.md`.

## This project

| Row | Value |
|---|---|
| Base branch | `main` |
| Promotion | none — `main`-only repo, no staging/uat/prod branch ladder |
| Reviewers | just me |
| Package manager | npm (`package-lock.json`) |
| Commit convention scopes | any — single deployable, no enumerated scope list |
| Ticket prefix | `T` (default; no issue tracker owns ids) |
| Stack gates | `format:check`, `lint`, `typecheck`, `test`, `build` (+ `test:coverage`), wired behind `npm run verify` |
| Where the app runs locally | `npm run dev` → http://localhost:3000. Today, features that hit the backend also need `dime-api` running separately (`npm run dev` in `../dime-api` → :4000) — this collapses to one process once the backend merge lands. Nothing must stay running between sessions; both are freely restartable. |
| Host | [Kuberns](https://kuberns.com) — AWS-backed PaaS, runs Next.js as a persistent Node.js server (no cold starts), optional horizontal scaling to multiple replicas, managed PostgreSQL/MySQL/MongoDB datastores |

CODEOWNERS is intentionally not set up (single reviewer — see `setup` skill's rationale: on a
one-developer repo it creates a self-approval deadlock, not extra safety). Add it when a second
reviewer exists.

## Verify

```bash
npm run verify
```

Runs the five gates (`format:check`, `lint`, `typecheck`, `test` — via `test:coverage`, `build`) via
`scripts/verify.mjs` and reports every gate's pass/fail, not just the first failure. Current state
(as of the `setup` pass): `typecheck`, `test`, `build` pass; `format:check` and `lint` are wired and
running for real but currently fail against the existing codebase — see `LEARNINGS.md` for what's
outstanding and why it wasn't silently fixed here.

## Process

This repo runs on the devx-starter phase workflow (skills under `.claude/skills/`): `setup` (this
document) → `tdd` (writes `phases/<NNN>-<slug>/tdd.md`) → `cut` (turns a tdd.md into `tasks.md`) →
`ticket`/`autopilot` (implements tasks). Root-level docs one level up (`../TDD.md`, `../TDD-PAISA.md`,
`../process.txt`) predate this workflow and record the original product/architecture decisions;
`TDD-PAISA.md` is authoritative over `../DESIGN.md`/`../PROGRESS.md`/`../TDD.md`/`../RESEARCH.md` where
they conflict, per its own framing as the current "what's left to build" companion doc.
