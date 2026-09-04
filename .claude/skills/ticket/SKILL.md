---
name: ticket
description: Use to take one FEATURE from nothing to a pull request — gathering context, asking what is genuinely unclear, writing one spec for the whole feature, implementing its tasks one commit each, updating what the change invalidated, running a review pass, and opening the PR. Covers when to split an oversized feature, the four conditions that stop it for a person to read the plan before code exists, and why it stops short of merging.
user-invocable: true
argument-hint: <FEATURE-N or a task id inside it>, or "… plan only" to stop after the spec
---

# Working a feature

**One feature, one spec, one branch, one pull request.** Its tasks are the steps inside it.
Context → questions → spec → **decide whether to stop** → code → review → PR.

## Why the unit is a feature and not a task

It was one ticket per task, and measured across two live repositories that cost **646 words of spec for 65
lines of product code**, with the same feature described twelve times. Ten sibling component definitions —
content the design had already specified in full — took ten branches, ten pull requests, ten CI runs and
3,661 words of spec to deliver **207 lines** of near-identical JSON.

The AI changed the cost of **writing**, not the cost of **reading**. A person still reviews. So the unit of
*work* is a feature and the unit of *review* stays a commit: **one commit per task**, which is what keeps a
300-line pull request readable. That rule is not negotiable — it is the whole reason a bigger ticket is safe.

`tasks.md` does not change. It stays fine-grained: it is the board, the dependency graph, and the `[P]`
information that lets features run alongside each other.

It ends at a pull request with green checks and **does not merge.** That is the one human decision left in
the chain, and it is deliberate — see step 11.

## 1. Check it is workable, then branch

Find the feature in `phases/*/tasks.md` — a `## Feature N:` heading and the tasks under it.

**Every `(after …)` id that points OUTSIDE the feature must already be `[X]`.** Dependencies between tasks
*inside* the feature are fine: they are the order you will work them in. One pointing outside and unfinished
means the feature is not startable — name it and stop.

**Work the whole feature. There is no line limit on a pull request.** Split it only if its tasks stop
belonging together, or if a checkpoint inside it ships something on its own and you want that landed sooner
— never because a diff crossed a number. One commit per task is what keeps the review readable.

Check nobody is on it: `bun run next` lists in-progress tasks, derived from the task ids in commits on
unmerged branches.

Then branch off the base branch named in `AGENTS.md → This project`:

```
git switch -c <FEATURE>-<short-slug>
```

## 2. Gather context — code before documents

Read, before asking anything:

- the task line, and the `tdd.md` section it comes from
- **`LEARNINGS.md`** — someone may already have paid for one of your questions
- **the code that already does something like this.** Find it. Do not assume it does not exist
- an earlier ticket spec in the same phase's `tickets/` that solved a similar problem
- **at least two neighbouring files**, for naming, error handling, test style, folder shape

State the convention you found back before you write anything against it. The codebase's conventions beat
any convention you would pick, including a better one — consistency is worth more than the improvement,
and the improvement is its own ticket.

**Hold on to this.** Everything below is written against what you read here. This is the step that used to
be thrown away at a skill boundary, and losing it is how naming and error handling quietly drift.

If this touches an external system, read the **live** thing rather than the TDD's description of it. Where
they disagree, say so: the TDD has gone stale, and every later task would have rediscovered it. The
correction lands in the TDD, not only in this spec.

## 3. Ask

**Use AskUserQuestion. One pass, options, recommendation first.**

Ask about anything that would change the shape of the work: an ambiguity, two reasonable designs, a
library choice, an edge case the TDD does not name, something you believe is wrong.

There is no budget on questions and no credit for a low count. Guessing to avoid interrupting someone turns
a two-minute answer into a day of wrong work.

**If the TDD answers it, that is not a question — that is reading.** Ask what the design genuinely left
open. If nothing is unclear, say so and move on; do not manufacture questions to look thorough.

## 4. Write the spec — one, for the whole feature

`phases/<phase>/tickets/<FEATURE>.md`, from `spec-template.md` beside this file.

**The template used to live in `phases/001-example-phase/tickets/`, and that was wrong.** The example phase is
deleted on the first real one — the process says so — so every project that had started for real was pointed at
a template that no longer existed. Two live repositories had 68 and 20 specs written against a missing file.
It belongs to the skill that uses it, and the skill directory is synced.

**One spec covers every task in the feature.** Measured on a real feature, that is 741 words replacing 4,443
across twelve per-task specs — and every field list and dependency edge survives.

**Record only what the design did NOT decide.** This is where the old per-task specs went wrong: eight of
twelve opened with a variant of *"the TDD's table fully specifies the shape; nothing here was ambiguous"* and
then wrote a question table proving they had read it. Of 130 such rows across one phase, 102 were decided by
the agent from the design. A table restating the design is ceremony. Three or four genuinely open decisions,
settled once for the whole feature, is a record — and it is more useful, because a call that governs two
components is now visible to a reader of both.

**Scale it to the feature.** Three sections always earn their place:

- **the questions and my answers, in my words** — the record of what was decided and why. This is the
  artefact the whole process exists to produce; a paraphrase loses the reason, and the reason is what the
  next person needs
- **acceptance criteria, each with the evidence that proves it** — a test name, a path, a response body.
  Never the word "verified": that is a claim, and claims are what this replaces. A criterion that cannot be
  proven goes under *Not verified* with a reason, rather than into the table

  **If this ticket changes what a user or a caller experiences, at least one criterion must be evidenced
  from a RUNNING INSTANCE** — a real request and its real response, a screenshot, a log line. Not only a
  test. Tests prove the units behave; they routinely pass while the thing is unusable, because the route
  was never registered, the middleware order is wrong, or the config the test stubs is unset in reality.
  Every green suite that shipped a broken feature failed in that gap. Paste the actual `curl` and what came
  back. For a ticket touching no user-visible surface — a schema, a shared helper — say so, and tests are
  enough.
- **what is out of scope** — so the pull request review is not a negotiation about what the task was

Then commit it **alone**, so the spec is the branch's first commit:

```
git add phases/*/tickets/<TASK>.md && git commit -m "docs(<TASK>): spec"
```

That ordering is not cosmetic. It is what makes the spec reviewable on its own in the pull request, and
what the `spec` check looks for.

## 5. Decide whether to stop here

The plan exists and is committed. Now decide whether a person reads it **before any code does**.

**The default is to keep going**, and that default was chosen rather than inherited. A mandatory pause on
every ticket bought an *opportunity* to read the plan, never a guarantee — nothing can prove a person read
anything — while costing a round trip on every ticket including the ones where the design had already
answered everything. Stopping is worth more when it is rarer and it means something.

**Four things stop you.** Say which fired, or say none did.

| | Stop when |
|---|---|
| **You were answered** | a question in step 3 got an answer from me. I am already in this ticket — showing me what my answer became costs almost nothing and catches the misreading immediately |
| **The list** | the ticket touches **authentication or authorisation**, **money**, **a migration or destructive operation**, or **a concurrency primitive**. Nothing else is on this list. Adjacency does not count |
| **An honest signal** | you were unsure and picked anyway · you changed approach while writing the spec · the scope came out materially bigger than the task line implied · the TDD turned out to be wrong about something |
| **I said so** | I asked for the plan only, or I am writing this ticket for someone else to build |

Otherwise, say in one line why you are continuing — *"no stop condition: the TDD answered everything, no
questions arose, nothing on the list"* — and go to step 6.

**Silence is not an answer.** A ticket that paused and one that did not must be distinguishable afterwards,
or the record of how the work was done is fiction.

## 6. The steps are the tasks

**Do not invent a numbering scheme.** The feature's tasks in `tasks.md`, in dependency order, ARE the steps.
Use TaskCreate one per task, keeping the task id as the identifier.

This replaced `S1`, `S2`, `S3`. Two schemes existed and neither was complete: of 237 commit subjects in one
repository, 122 carried a task id and 125 carried only a step number, so traceability depended on which one a
reader happened to look for. One id, `T063`, is the task, the step, the commit and the checkbox.

Use a sub-step — `T063.1` — only for work genuinely inside one commit: wiring a route the handler needs,
running `bun run verify`, gathering the evidence for a criterion. If two sub-steps each want their own commit
they were never sub-steps; they are two tasks, and the cut was wrong.

Show the list before starting.

## 7. Work them one at a time

For each step:

- mark it in progress
- **if the task is `[TEST]`, write the test first and run it — it must fail.** Show the failure before
  writing the code. A test written after the implementation is shaped to agree with it, and it passes for
  exactly the reason the bug survives
- write the code, matching the conventions you stated back in step 2
- write or update the tests that prove it
- `bun run verify`
- commit, following the convention in `AGENTS.md → This project`, and **end the subject with the task id** —
  `feat(db): links table and index (T014)`. That is what makes commit → task → feature → design traceable in
  both directions, and it costs six characters.

  **It is also load-bearing, not documentation.** `board.mjs` reads task ids out of commit subjects on
  unmerged branches to decide what is in progress. A feature branch is not named after any single task, so a
  commit without its id leaves that task looking *ready* — and `bun run next` will hand it to a second
  session, putting two agents on the same files
- mark it complete

Do not batch commits at the end. The commit trail is what makes the review readable, and it is most of what
makes this faster than the alternative.

**If a step needs something the spec does not cover, stop and ask.** That is a spec change, and a spec
change is a person's call. The temptation to absorb it quietly is the most common way a ticket becomes
unreviewable — and it is the one place where continuing without asking is never right, whatever step 5
decided.

**If the answer is not yours to give — a client's call, a scope change, an acceptance criterion — park
it.** Write the one thing the ticket needs into a `## Blocked on` section of the spec, one sentence on
the first line, and commit it. `bun run open` reads that section, so the question outlives the session
that found it. A question recorded only in a closing report is one nobody can find tomorrow.

## 8. Update what the change invalidated

Run `bun run docs` and `bun run structure` first — one names documents whose subject matter has moved on
without them, the other names files that exist where the design never said they would. Then walk this list
and **say what you did for each**, including "nothing, because…". Silence on a row is indistinguishable
from having forgotten it.

| If this ticket… | Update, in this branch |
|---|---|
| changed an endpoint, field, status code or error | **`docs/api.md`** — consumers cannot read `phases/` |
| changed configuration, startup, deploy, or added a way this fails | **`docs/operations.md`** — including a row in its failure table |
| added or changed an external system | **`docs/integrations/<service>.md`**, its committed fixture, and a line in `docs/.watch` |
| created a file the design's project structure does not list | **`phases/<phase>/tdd.md`** — add it to the tree, or move the file. `bun run structure` names them |
| contradicted a decision or contract in the phase design | **`phases/<phase>/tdd.md`** — the code is right, the document has gone stale |
| made a decision spanning phases, or reversed an earlier one | **`docs/decisions/NNN-*.md`** — and only then. A decision inside one phase belongs in that phase's TDD |
| found something non-obvious | **`LEARNINGS.md`**, one line |
| — always | tick the task `[X]` in `phases/<phase>/tasks.md`; the pre-commit hook stages the board |

**In this branch, not a later one.** A document corrected afterwards is wrong in between, and the pull
request that fixes it is one nobody reads.

**Do not write a document the change did not invalidate.** Padding a ticket with documentation is how
`docs/` fills with files nobody trusts — and `docs/README.md` names what does not belong there.

## 9. Review — but only when the change earns it

Report the size, as context for whoever reads this:

```
git diff --stat <base>...HEAD
```

It is context, not a gate. No diff is too big to review, and nothing here asks you to split because of a
number.

Then read `references/review.md` and follow it. It decides whether this ticket is reviewed now or at its
feature checkpoint, how to dispatch, and what the checkpoint pass looks for. **Say which you chose and why,
every time** — a review nobody ran and one that found nothing look identical afterwards, and only one of
them is evidence.

**Write it in the pull request, not only in the chat.** There is a `## Review` section in the template
with the three answers; put one of them there. Said in a session it reaches whoever was watching; written
in the pull request it reaches everyone and `bun run conform` can count it across the project. Nine of
asaya's pull requests were checked and not one recorded this — the rule was being followed and nobody
downstream could tell.

## 10. Look at the board

```
bun run dash
```

Confirm the phase board reflects the feature — the ticked checkboxes, the statuses, the branch. It derives
from files, so it usually does. A five-second look, not a task.

**Do not add a dashboard panel.** That instruction lived here for two releases and was wrong: the page is one
band showing the phase boards, so there is nowhere for a per-feature panel to go. It was read once per ticket
and asked for work that did not exist. If you believe the page is genuinely missing something, that is its own
change against `scripts/dash/DESIGN.md`, not a line item here.

## 11. Open the pull request

One pull request for the feature. Write the body to a file first — it is long enough that inlining it goes
wrong:

```
git push -u origin HEAD
gh pr create --base <base branch> --title "<FEATURE> — <goal>" --body-file /tmp/<FEATURE>-pr.md
```

Fill `.github/pull_request_template.md`: the goal, the acceptance criteria **with evidence filled in**, and
what you did not verify. Copy the criteria from the spec — if a row's evidence turned out different from
what the spec predicted, the spec was wrong and it gets corrected too.

Wait for CI. Fix red checks — twice, then stop and ask. Looping on a red gate burns budget and produces
nothing.

## 12. Stop at the pull request

Say it is ready, what its checks say, whether step 5 paused and why, and **what you could not verify.** A
report claiming everything is checked is not one.

**Do not merge, and never approve your own pull request.** This is the last place a person is required, and
it is required precisely because step 5 made the earlier pause conditional. Removing both would leave a
ticket that went from a task line to the base branch with nobody in it.

The decision is a person's; the act is yours once they say yes.
