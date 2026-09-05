# PRD

> **Pointer, not a PRD.**

There is no separate PRD for this engagement. For phase `001-merge-backend-into-nextjs`, the
requirement layer is [`docs/decisions/001-merge-backend-into-nextjs.md`](../decisions/001-merge-backend-into-nextjs.md)
— the decision record that supersedes `../../TDD.md` §"Architecture" ("Two separate repositories") and
`../../process.txt`'s 2026-04-05 entry ("No NextAuth/Auth.js — the backend is a separate Fastify
server, not a Next.js API route").

Ongoing product requirements for existing features (transactions, budgets, ledger, templates, CSV,
analytics) still live in `../../TDD.md` and `../../TDD-PAISA.md` (authoritative over `TDD.md` where
they conflict). This phase changes only *how* those features are served — folding the standalone
`dime-api` backend into this repo — not *what* they do. No product behavior is in scope for this phase.
