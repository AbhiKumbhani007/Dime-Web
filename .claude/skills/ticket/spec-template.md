# F0N — <the feature, one line>

**Feature** `../tasks.md#feature-N` · **Design** `../tdd.md#section` · **Story** USn

**One spec per FEATURE, not per task.** Its tasks are the steps below. Measured on a real feature, that is
741 words replacing 4,443 across twelve per-task specs, with every field list and dependency edge intact.

## Goal

What changes, for whom, and where this feature stops. Two or three sentences.

## Decisions

**Only what the design did NOT decide.** If the TDD specifies it, that is reading, not a decision — do not
tabulate it to prove you read it. Eight of twelve per-task specs in one real phase opened with a variant of
*"the TDD's table fully specifies the shape; nothing here was ambiguous"* and then wrote the table anyway. Of
130 such rows, 102 were the agent restating the design.

Three or four rows for a whole feature is normal. Zero is legitimate — say so in one line and move on.

| Question | Answer | Why |
|---|---|---|
| Should an expired token 401 or 403? | 401 | 403 implies the identity was accepted |

Settling them here rather than per task is also better: a call that governs two components is now visible to
a reader of both, instead of buried in the first one's spec.

## Steps

One commit per task, subject ending in the task id. Keep them in dependency order.

| Step | What | Notes |
|---|---|---|
| `T014` | the session module | `src/auth/session.ts` |
| `T015` | wire the login route | `src/routes/login.ts` — after `T014` |

Say which are independent and which wait on which — it is the same information as `(after …)` in `tasks.md`,
and a reader of the pull request does not have the board open.

## Acceptance criteria

Each row needs **evidence a person can open**: a test name, a file path, a screenshot, a response body.
Not the words "verified", "done", "tested" — those are claims, and a claim is what we are replacing.

Where the TDD set a numeric anchor, **use that number**. Do not soften it, and do not substitute a
prose version of it. If the anchor cannot be met, that is a finding for the pull request, not a
criterion to reword.

| # | Criterion | Evidence |
|---|---|---|
| 1 | Valid credentials return a token | `login returns a token for valid credentials` in `src/routes/login.test.ts` |
| 2 | Wrong password returns 401, never 403 | same file, `rejects a wrong password with 401` |

## Not verified

What this does not prove, and why. Anything that cannot be checked mechanically belongs here rather
than in the table above — an unprovable row in the table is how a green check comes to mean nothing.

## Out of scope

Named explicitly, so the pull request review is not a negotiation about what the ticket was.

## Blocked on

**Delete this section unless the feature is parked.** One sentence on the first line: the single thing this is
waiting on, and who owes the answer. `bun run open` reads it, so a parked feature is visible to the next
session instead of dying in the transcript that parked it. Name the task it blocks, since one spec now covers
several.

Only for questions that are not yours to decide — a client's call, a scope change, an acceptance
criterion. A question two reasonable engineers would disagree about is one you decide and record under
*What I asked, and what you said*.
