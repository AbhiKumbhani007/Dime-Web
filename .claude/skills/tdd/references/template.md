# TDD — Phase N: <name>

**Source** `docs/inputs/prd.md#section` · `docs/inputs/sow.md#phase-n`
**Status** draft | approved (YYYY-MM-DD, by whom)
**Verified against** which live systems were read, and on what date

Delete any section that does not apply, replacing it with one line saying why. An empty section cannot
be told apart from an unconsidered one.

## Summary

Three sentences. What this phase delivers, and the technical approach in one clause.

## Scope

**In.** What gets built.

**Out.** What does not, named explicitly — this is the boundary that gets argued about later.

**Depends on.** What must already exist. Earlier phases, an environment, a credential, a client decision.

## Context

| | |
|---|---|
| Language / runtime | |
| Primary dependencies | with versions, if a version matters |
| Storage | |
| Testing | the frameworks, and how they are run |
| Deploy target | |
| Performance goals | **numbers** — `p95 < 200ms`, `10k rows`, `60fps` |
| Constraints | anything fixed rather than chosen |

## Project structure

**Organising principle:** <by feature | by layer | by feature, with shared code by layer> — and why.

On an existing codebase this is one line: *"the shape the repository already has"*. Follow it even if
you would have chosen differently; consistency beats the improvement, and the improvement is its own
ticket.

**On a greenfield phase this is a decision like any other, and it gets a row in the decision table
above** — with the alternative you rejected. It is the decision with the longest half-life in the
project: every later phase either follows it or fights it, and nobody revisits it because by then it is
"how the code is". Do not let it be the one choice in this document that arrived by default.

| Common shape | Right when | Wrong when |
|---|---|---|
| flat `src/` | under ~15 files and one domain | a second domain appears — everything then sits beside everything |
| by feature (`src/links/`, `src/users/`) | features are the unit of change, which is usually | shared plumbing gets copied into each because there is nowhere else |
| by layer (`src/routes/`, `src/services/`) | layers genuinely vary independently | one change touches four directories, which is most changes |
| feature + shared layer | more than one domain and real shared plumbing | it is one domain — this is ceremony |

Then the **real** tree this phase touches:

```text
src/modules/checkout/
    checkout.controller.ts     new
    checkout.service.ts        new
    checkout.module.ts         new
src/common/money/
    index.ts                   changed — add roundHalfEven
test/checkout/
    checkout.contract.spec.ts  new
```

**Every file the phase creates appears here — including tests, fixtures and type declarations.**
`bun run structure` walks the real directories and reports anything the tree does not mention. A file
that exists and is not in this document is the drift that makes a design quietly untrue: not a wrong
sentence, but a directory nobody wrote down.

Every task cut from this document lands in a path that appears here.

## Architecture

How it works. Then, for every decision that could reasonably have gone another way:

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Idempotency | key in a table, 24h TTL | dedupe on payload hash | payload is not stable across retries |

Without the rejected column, month three re-opens this without the context and picks differently.

## Data model

Per entity: fields, types, nullability, defaults, constraints, indexes.

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | uuid v7 | no | surrogate PK |
| `order_number` | varchar(20) | no | trimmed + uppercased. **Chain identity** |
| `version` | int | no | `unique (order_number, version)` |

**Identity.** What makes two rows the same row.

**Lifecycle.** The states, and which transitions are legal.

```
Draft ──activate──> Active ──supersede──> Superseded
  │                                              ▲
  └──────────────── delete ─────────────────────┘   refused when Active
```

**Concurrency.** What happens on a simultaneous write. Say it even when the answer is "last write wins,
deliberately".

**Migrations.** What this phase adds, and whether any of it is destructive.

## API contracts

Real shapes. **Error cases are the point** — they are where an agent guesses, and a guessed error
contract is found by the client.

```
POST /api/orders
  body  { orderNumber: string, items: [{ sku: string, qty: int }] }
  → 201 { id: uuid, version: 1, createdAt: ISO8601 }
  → 400 { error: "validation_failed", fields: string[] }
  → 409 { error: "order_number_taken" }         orderNumber exists in this division
  → 428 { error: "if_match_required" }          mutation without If-Match
```

Headers that carry meaning — `If-Match`, `Idempotency-Key`, `ETag` — are part of the contract. Say
which endpoints require them and what happens when they are absent.

## External dependencies

| Service | Used for | Auth | Failure mode | Fixture |
|---|---|---|---|---|
| Stripe | payment intent | secret key, env | 402 → surface, do not retry | `fixtures/stripe-intent.json` |

**Every shape here was observed from the live service**, not from memory. Say when, and commit the
fixture. Note the quota or rate limit if there is one.

## Testing and done

| Level | Proves | Where |
|---|---|---|
| unit | the calculation, exhaustively | `packages/money/test/` |
| contract | every endpoint's shape and status codes | `test/*.contract.spec.ts` |
| integration | the business-rule invariants, written red first | `test/*.int.spec.ts` |
| e2e | the one journey a user actually takes | `e2e/` |

**Done for this phase** — a list of demonstrable things, each of which becomes the final validation task:

- [ ] a user can complete the journey end to end on a deployed environment
- [ ] every endpoint in this document answers with the documented shape
- [ ] no stub or `501` remains

### Numeric anchors

Anything about speed, size, cost or quality gets a number here, and the ticket specs use **this**
number rather than inventing a softer one. Without a number the criterion cannot fail, and a criterion
that cannot fail is not a criterion.

| Property | Anchor |
|---|---|
| p95 response, authenticated read | ≤ 200ms |
| cold start | ≤ 1.5s |
| bundle added by this phase | ≤ 40KB gzipped |
| cost per 1,000 requests | ≤ ₹2 |

Pick the two or three that this phase can actually be wrong about, and leave the rest out. Four real
anchors beat twelve aspirational ones.

Why this exists: a review of 37 specs written without anchors found **94 acceptance criteria recorded
"Not verified"**. Prose criteria are not unverified by accident — there was nothing there to verify.

## Open questions

Each one blocks something. Say what.

| # | Question | Owner | Blocks | Asked |
|---|---|---|---|---|
| 1 | Do sessions survive a password change? | client | T005, T006 | 2026-08-08 |

An open question is a normal feature of a TDD. Guessing one closed is not.

## Risks

Only the ones that would change what we build. What we would do about each.
