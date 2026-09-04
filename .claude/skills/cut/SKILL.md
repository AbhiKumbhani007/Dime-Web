---
name: cut
description: Use when turning a phase's TDD into its task list — the dependency-ordered tasks.md that drives the board. Covers the line format, how to size a task so it is one commit, grouping by user story so each is independently shippable, getting the (after ...) graph right, and the test each task must pass before it counts as written.
user-invocable: true
argument-hint: <phase-dir>
---

# Cutting a TDD into tasks

Produce `phases/<phase>/tasks.md` from `phases/<phase>/tdd.md`.

**The bar:** someone opens a task, reads that one line, and knows which files to touch and what "done"
means — without reading the whole TDD and without asking you.

If you cannot cut a task to that standard, the TDD is not finished. **Say so and stop.** Go back to
`tdd`; do not paper over a vague design with a vague task, because the vagueness reappears as a
question during implementation, which is the most expensive place to answer it.

## The line format

```
- [ ] T001 [P] [US1] [TEST] Description of the work `path/to/file.ts` (after T000, T002)
```

| Part | Means |
|---|---|
| `[ ]` / `[X]` | not done / done. **The only place completion is recorded** |
| `T001` | id. Ascending, repo-global across every phase, never reused |
| `[P]` | parallelisable — different files, no incomplete dependency |
| `[US1]` | which user story it serves. Omit on foundational work |
| `[TEST]` | writes tests. They come before the code they cover, and must fail first |
| `` `path` `` | the file or directory it lands in. **Must appear in the TDD's project structure** |
| `(after …)` | what must be done first. This builds the dependency graph |

## Sizing

One task is **one commit-sized piece of work**. A task is a commit; a **feature** is the branch, the spec and
the pull request. So size the task for a commit and size the FEATURE for a review.

**The task:**

- needs "and" in the description → two tasks
- cannot be verified on its own → it is half a task; find the other half or merge them

**The feature**, and this is the one that matters, because it is the diff a person reads:

- **No line ceiling.** A feature is not too big because its diff crossed a number. Split it only when its
  tasks stop belonging together, or at a checkpoint that ships something on its own.
- one commit per task is what keeps a large feature readable, however many tasks it holds

**AND THERE IS A FLOOR.** This section had a ceiling and no floor, plus "one file or directory behind it" —
which is an instruction to cut one task per file, and that is exactly what happened. Ten component
definitions became ten tasks, ten branches, ten pull requests and 3,661 words of spec for **207 lines** of
near-identical JSON.

> **Sibling tasks that share one dependency, are the same shape, and whose content the design already
> specifies are ONE task with one checkbox per file.**

If you find yourself writing the same task line ten times with a different filename, you are padding the
board. `bun run board` names this shape when it sees it.

## Features

A **phase** is the unit of delivery — one TDD, one directory, cut from the SOW. A **feature** is a group
of tickets inside it, ending at a checkpoint. Two words, because one word for both is how a board ends
up saying "Phase 1" inside "phase 001".

```
## Feature N: Tag — Name
```

Most features map to a user story. Two usually do not, and that is fine — name them for what they are:
**Foundational** (the schema and plumbing everything else needs) first, and **Polish** (the end-to-end
journey and the validation gate) last.

1. **Foundational** — schema, shared types, module shell, anything every story needs. Nothing else
   starts until it is complete.
2. **One feature per user story**, in priority order. Each ends at a checkpoint where **that story works
   end to end on its own** — that is what makes it an MVP increment rather than a slice of plumbing.
3. **Polish** — the end-to-end journey, and a final validation task that demonstrates every item in the
   TDD's "Done" list and confirms no stub or `501` survives.

End each feature with a one-line **Checkpoint** saying what is true now that was not before.

Order the story features so the highest-priority one lands first. If the project stops after Feature 2,
what shipped should still be worth having.

## Getting `(after …)` right

This is the part that pays or costs most, because the board's "ready" is only as true as this list.

- a task depends on another when it **would fail without it**, not when it is merely related
- do not chain tasks that could run alongside each other — a false dependency makes the board show one
  ready task where there were four, and quietly serialises work that did not need to be
- do not omit a real one — a missing dependency shows a task as ready when starting it means building
  on something that does not exist
- tests depend on the contracts they assert against, not on the implementation they will drive

**Cut the contract as its own task, first.** Most `(after …)` edges are not "needs the behaviour",
they are "needs the type". Those are the edges that flatten. Put the shared surface — types, schemas,
enums, interfaces, the API shape — in one task at the top of the feature, and point every consumer at
that instead of at each other. The consumers are then genuinely parallel: they build against a frozen
contract, not against work in progress.

Measured on a real phase before this rule existed: 37 tasks, **11 dependency levels**, 3.4 tasks
available at once, and five of those levels holding a single task. Eleven sequential rounds for 37
tasks, most of them waiting on a type.

The cost is honest and worth stating: if the contract turns out wrong, every task built against it
needs a coordinated fix. That is the trade. It is why the contract task is the one to think hardest
about, and why it is reviewed before the parallel work starts.

Mark `[P]` on everything with no incomplete dependency and no shared file with a sibling. That marker is
what lets several sessions work at once, so an unmarked parallelisable task is speed left on the table.

## Ids

`T001` ascending, repo-global across every phase, never reused. Read the highest id in **all** of
`phases/*/tasks.md` before minting — two phases minting from their own counters produces two `T014`s, and
the board will refuse both.

## Then look at the dashboard

Run `bun run dash` and open the phase in the rail. This is the first moment the board has anything to show,
and it is the cheapest possible check on the cut: a task that reads *Ready* while its own text says it waits
on something, or a phase whose graph does not parse, is visible here in seconds and expensive to find later.

**Read what `bun run board` printed.** It is advisory and it says three things this skill asks for but cannot
enforce in prose — how many tasks look parallelisable but are unmarked, how many dependency levels the graph
has, and whether a run of siblings should have been one task. All three were being skipped before the board
started reporting them: one real phase marked 8 of 37 tasks `[P]` and strung 37 tasks through 11 levels.

## Before you say it is done

Take three tasks — one foundational, one mid-stack, one at the edge — and check each:

1. Does its path appear in the TDD's project structure?
2. Does the TDD say enough to implement it without asking anything?
3. Could someone verify it on its own, without the rest of the phase?
4. Is every dependency real, and is every real dependency listed?

Then:

```
bun run board
```

It generates the board and **fails** on a duplicate id or a dependency pointing at a task that does not
exist. Commit `tasks.md` and the board together — the pre-commit hook stages the board for you.

Show me the list and stop. Do not write ticket specs and do not write code: a task says *what*, and the
ticket spec says *how*, written one at a time against the code as it actually is by then.
