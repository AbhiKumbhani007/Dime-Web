---
name: autopilot
description: Use when the developer wants tickets worked end to end without being asked anything — deciding the ordinary questions itself and running until the phase is done or something genuinely needs a person. Covers what it decides, what it refuses to decide, how every decision is recorded, and the conditions that stop it.
user-invocable: true
argument-hint: (optional) a task id to start from, or a narrower stop point than "the whole phase"
---

# Autopilot

Work tickets end to end without asking. Decide the ordinary questions, record every one, and stop only
when something genuinely needs a person.

## Why this is a command and not a setting

**A persistent "do not ask me" flag is how a repository gets twenty unreviewed merges.** Someone turns
it on for an evening, forgets, and three weeks later nobody can tell which decisions a person made and
which were inferred. The record looks identical either way, and that is the failure — not the
automation.

So autopilot lasts one invocation. It says what it is about to do, runs, and stops. To go again, ask
again.

## The honest case for it

The process has two approval points: the spec, and the pull request. Autopilot removes the first.

That is a real loss **only if the approval was real.** A developer approving twenty-three specs at
two in the morning is not reviewing them — and an approval that always says yes is worse than no
approval, because it leaves a record claiming a person agreed. If you are going to say yes to
everything, saying so up front is the more honest arrangement.

Use it when: the design is complete and you have read it, the work is well-trodden, or being wrong is
cheap and reversible. Do not use it on the first phase of an unfamiliar domain.

## Before starting

State, and wait for one confirmation — **this is the single approval that covers the whole run**:

- which tasks it will attempt, from `bun run next`
- where it will stop — **by default every remaining ticket in the phase**, not one, and not one feature
- that it will decide ordinary design questions itself, and record each one
- **what it will not do** — the list below

Then do not ask again until a stop condition fires.

## What it decides for itself

Anything a competent developer would decide without escalating:

- which of two reasonable implementations to use
- naming, file placement within the design's structure, test organisation
- an edge case the TDD does not name, where either answer is defensible
- how to fix a red check whose cause is clear

**For each one, take the option you would have recommended, and record it.** The recording is what makes
this reviewable rather than merely fast.

## What it will not decide — stop and report instead

These are not "hard questions". They are decisions that are **not the agent's to make**, and no amount
of confidence changes that:

| | Why |
|---|---|
| anything that changes **acceptance criteria** | those are the contract. Proposing a change is allowed; approving one is not |
| a **scope change** — the work needs something the spec does not cover | that is a spec change, and the spec was approved by a person |
| anything that would **weaken a gate** to make something pass | the reason the gate exists is that this feels reasonable in the moment |
| a question whose answers **differ in what the client is owed** | pricing, data retention, what an error tells a user — the client decides, not us |
| writing or editing the **SOW or PRD** | authoring the scope the client is held to leaves nobody to confirm it |
| **approving its own pull request** | never, under any mode |

Merging is unchanged: the host decides. **Autopilot does not bypass branch protection**, and on a
protected branch it will open the pull request and stop.

### The test, when you are unsure which side something falls on

> **Would two reasonable engineers disagree, or would two reasonable clients disagree?**

Engineers disagreeing is a design choice — **decide it and record it.** Whether to reject
`http://localhost` as a destination, how long a URL may be *in principle*, which of two encodings to
use: pick one, say why, move on.

Clients disagreeing means the answer changes what they are owed — **park it.** Whether 2048 characters
covers *their actual campaign URLs* is not a fact in the repository, and no amount of reading gets you
there.

**"The TDD does not cover this" is not, by itself, a blocker.** Most gaps in a design are ordinary
choices nobody thought to write down, and filling them is the job. It becomes a blocker only when the
answer is one the client is owed — or when filling it would change an acceptance criterion.

A gap you filled is worth recording twice: in the spec, and as a line for `/harvest`. A design that
keeps leaving the same kind of gap has a template problem, and that is worth more than any single
answer.

## The loop — every ticket, not one

```
┌─────────────────────────────────────────────────────────────┐
│  bun run next  →  /ticket <T>  →  pull request              │
│        ↑                                 │                  │
│        └──────────── merge ──────────────┘                  │
└─────────────────────────────────────────────────────────────┘
              repeat until a stop condition fires
```

**Do not hand back after a ticket.** Finishing one and reporting is the natural thing to do and it is
the single most likely way this fails — you end up with a supervised run wearing an unattended label,
and the developer has to say "continue" twenty-three times.

When a ticket merges, immediately run `bun run next` and start the next one. No summary between
tickets, no "shall I proceed", no pause to confirm the obvious. **The only thing that ends the run is a
stop condition below.**

By default the stop point is **every remaining ticket in the phase.** Say so at the start; narrow it
only if the developer asked for a smaller run.

Take `[P]` tasks in the same feature before moving on, so the dependency graph is actually used.

Per ticket, follow `ticket` exactly — **the checks do not relax.** Tests still come before the code they
cover, `bun run verify` still has to pass, the review triggers still fire, and the feature checkpoint
review still runs. Autopilot changes **who approves**, not **what runs**.

**Its step 5 is the one thing autopilot overrides.** Where `ticket` pauses for a person to read the spec,
autopilot decides and records instead — unless the condition that fired is one it may not decide, in which
case it parks the ticket and takes the next. The discriminator is the same one this skill already uses:
would two reasonable *engineers* disagree, or two reasonable *clients*?

Keep a running note as you go: each ticket, each decision, each thing you could not verify. It becomes
the closing report, and writing it at the end from memory is how the decision list gets short.

## Recording, so the run is reviewable afterwards

Every spec written under autopilot carries this at the top:

```markdown
> **Written under autopilot** on YYYY-MM-DD. The questions below were answered by the agent, not by a
> person. Read them first.
```

And every decision goes in the spec's question table with its reason:

| Question | Answer | Decided by |
|---|---|---|
| 404 or 410 for a deleted alias? | 410 — it existed, and support gets the same signal as expiry | autopilot |

**Do not skip the questions because nobody is answering them.** They are the record of what was decided
and why; a spec with an empty question table after an unattended run is a spec that hides its own
reasoning.

## When something blocks: park the ticket, do not halt the run

A refused decision blocks **one ticket**. It almost never blocks the phase, and halting the whole run for
it wastes every other ready task — which is the opposite of what you were asked to do.

So when you hit a row in "what it will not decide":

1. **Decide everything about that ticket that you can**, and record it. A ticket usually has one genuine
   blocker and several ordinary choices; do not return all of them as questions.
2. **Park the ticket.** Leave the branch, do not merge it, and write the one thing it needs into a
   `## Blocked on` section of its spec — **one sentence, first line, plain.** Commit that. A question
   that lives only in your closing report dies with the session; `bun run open` reads this section, so
   the next person to ask "what is waiting on a client?" gets an answer without finding the transcript.
3. **Run `bun run next` and take the next ready task.** Keep going.
4. Report every parked ticket at the end, each with the single question it is waiting on.

A parked ticket blocks whatever depends on it, and the graph already knows that — those tasks simply
never become ready. That is the dependency board doing its job, not a reason to stop.

**One question, asked once, at the end.** Not four questions per ticket as you meet them; the point of
an unattended run is that the developer answers a batch when they return, not that they are interrupted
four times.

## Stop conditions

Stop the whole run only for these:

- the stop point agreed at the start is reached
- `bun run next` reports **nothing ready and nothing in progress** — everything left is blocked or parked
- **two consecutive failed attempts** at the same red check on the same ticket
- the same question arises for a **third time across tickets** — that is a missing rule, and `/harvest`
  should have it rather than autopilot answering it again
- something is wrong with the repository itself: the graph is invalid, the base branch moved under you,
  a gate is failing for a reason unrelated to your change

## The closing report

Not a summary of what was built — a summary of **what a person now has to check**:

1. **Every decision made on your behalf**, in one list, with the ticket and the reason. This is the part
   to read.
2. Which tickets landed, and which checks passed on each.
3. **What could not be verified**, across the whole run.
4. **Every parked ticket, with the one question it is waiting on** — batched, so you answer once.
5. Anything that stopped the run entirely, and what it needs from you.
6. Where the run departed from the design, and whether the design was corrected.

A run that reports only successes has not been read carefully enough to trust.
