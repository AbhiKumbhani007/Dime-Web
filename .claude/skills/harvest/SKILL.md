---
name: harvest
description: Use at the end of a phase, or when LEARNINGS.md passes roughly 20 lines — turning what the project learned into rules and checks, and deleting the prose those checks replace. Covers grouping learnings by repetition, promoting each to the right form, and the pruning half that normally gets skipped.
user-invocable: true
---

# Harvesting what the project learned

Promote what this project has learned into the things that enforce it, and remove what no longer earns
its place.

A learning is a note somebody has to read. A check is something that happens whether they read it or
not. This is how the first becomes the second — the only way the process gets better at the thing it
keeps getting wrong.

Run it **at the end of every phase**, and any time `LEARNINGS.md` passes roughly 20 lines.

## 1. Read what actually happened

- `LEARNINGS.md`
- the phase's `tickets/*.md` — specifically the **Not verified** sections, and the questions asked. A
  question asked in three tickets is a missing rule, and it is invisible from inside any one of them
- the phase's `tdd.md` open questions: which were answered during the build rather than before it
- `git log` for commits that fix our own process rather than the product

## 2. Find the repeats

**Repetition is the signal.** One learning is a note. The same *class* of learning twice is something
the repository should be enforcing.

Group them and say how many times each pattern occurred. Do not skip to proposing — the count is the
entire argument for promoting one thing and leaving another alone.

## 3. Propose, one at a time

For each candidate, AskUserQuestion with your recommendation first:

| Promote to | When |
|---|---|
| **a check** — lint rule, test, or a step in `ci.yml` | it can be decided mechanically. **Always prefer this.** A check is the only form that survives someone not reading |
| **a rule** in `AGENTS.md` | it needs judgment, so no check can decide it, but it applies to every ticket |
| **the project profile** in `AGENTS.md → This project` | it is a fact about this project — a command, a branch, a convention — rather than a rule |
| **the TDD template or `tdd`** | the design kept missing the same category. This is the highest-leverage promotion available: it stops the gap being created rather than catching it later |
| **a fixture** under the phase | it is an external system's real shape. Commit it and read the file, so results stop depending on which tools were connected |
| **leave it** | genuinely one-off |
| **delete it** | no longer true. Say why in the commit, not in the file |

## 4. Then prune — this is the half that gets skipped

Every promotion has a matching deletion, or the repository now holds two copies of one truth and the
stale one is what somebody reads.

- a learning that became **a check** leaves `LEARNINGS.md` — name the check in the commit message
- a rule in `AGENTS.md` that a check now enforces shrinks to **naming the command**, not restating the
  rule. `"bun run verify runs the gates"` stays true for ever; a list of the gates goes stale the first
  time one is added
- a learning contradicted by a later one: delete the old one. Do not stack them

Then check the other direction: **anything in `AGENTS.md` that no longer matches how the project
actually works.** A rule nobody follows is worse than no rule, because it teaches people that the rules
in that file are optional.

## 5. Ask whether any of it belongs on the dashboard

Some of what a harvest finds is not a rule for an agent — it is a question a person kept having to ask.
Those become views, not paragraphs. If the same "what is the state of X" came up three times in the
history you just read, a person is doing by hand what a deriver could do once.

Add it under `scripts/dash/panels/`, in this same pull request. `scripts/dash/DESIGN.md` is the
doctrine, and the only hard rule is that it derives from a file or a git ref rather than from anything
typed for it.

## 6. Land it

One commit: `chore(process): harvest — <n> promoted, <n> pruned`. In the body, say what became a check
and what was deleted, so the next harvest can see what this one decided.

If a promotion means editing `ci.yml` or adding a lint rule, **that is its own ticket.** A change to a
gate goes through the same loop as any other change and never rides along in a docs commit.
