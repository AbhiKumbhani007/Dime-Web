# Dime Web

Next.js frontend for **Dime**, a personal expense tracker (transactions, budgets, an IOU ledger,
CSV import/export, spending insights). Built with the App Router, React 19, TanStack Query, Zustand,
and Radix/Tailwind UI primitives.

## Running it

```bash
npm install
npm run dev
```

Opens on http://localhost:3000. Some features currently require the sibling `dime-api` backend
running too (`cd ../dime-api && npm run dev`, http://localhost:4000) — this repository is in the
process of absorbing that backend directly (see `docs/decisions/001-merge-backend-into-nextjs.md`),
after which a single `npm run dev` here will be enough.

## Checking your work

```bash
npm run verify      # format:check, lint, typecheck, test (+coverage), build — all five gates, all reported
npm run test:e2e     # Playwright end-to-end suite
```

## Where the process lives

See [`AGENTS.md`](./AGENTS.md) for the project profile (branch/commit conventions, host, local-dev
notes) and [`LEARNINGS.md`](./LEARNINGS.md) for gotchas worth knowing before you touch this code.
Feature/phase work follows the devx-starter workflow under `.claude/skills/` (`setup` → `tdd` → `cut`
→ `ticket`/`autopilot`); design docs land under `phases/<NNN>-<slug>/`.
