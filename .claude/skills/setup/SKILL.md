---
name: setup
description: Use once, on a repository just cloned or forked from this starter, before any phase exists — filling in the project profile, wiring the five gates to this stack, and naming what only the host can do. Covers pinning versions against the live registry rather than memory, the questions that are a person's to answer, multi-root repositories, and the CI trap that makes a required check wait for ever.
user-invocable: true
argument-hint: (optional) the stack, e.g. "bun + postgres" or "monorepo, bff + strapi + react-native"
---

# Setting up a repository

Take a fresh clone of this starter to the point where `/tdd` can run: the profile filled in, the
gates wired to this stack, the hooks proven to work, and the host settings named.

**Run this once.** Everything after it is a phase, and `bun run setup` reports state rather than
remembering it, so re-running either command is free.

**This does not write a TDD and does not cut tasks.** The scaffold lands as the repository's initial
commit, not as a ticket — there is no phase to hang a ticket on yet, and the `spec` check knows that: it
asks for nothing until a real phase exists. `/tdd` is the next thing a person runs, and it is theirs
to start.

## 1. Run setup, and work its list

```
bun install && bun run setup
```

It reads the repository and prints `ok` and `todo` rows. **Work its output, not this document** — it is
checked against the project and this file is not. Everything below is the reasoning behind the rows it
cannot explain, and the decisions it cannot make for you.

If it reports the commit-msg hook installed but not running, stop and fix that first. A repository whose
first commit fails is one nobody trusts, and this exact defect shipped once: the config resolved on the
author's machine from an untracked artifact and on no clone.

## 2. Fill the project profile — these are decisions, so ask

`AGENTS.md → This project` is the table every command reads instead of guessing. A guess about the branch
model or the commit convention is a guess that fails on the first pull request.

Use AskUserQuestion, **one question per turn**, recommendation first with one sentence of why. Ask only
what you cannot read off the repository:

| Row | Read it, or ask |
|---|---|
| Base branch | **read** — `git branch --show-current` on a fresh clone, or the remote's default |
| Promotion | **ask** if there is more than one long-lived branch. Delete the row on a main-only repo — CI reads the ladder from it |
| Reviewers | **ask** — who can approve besides the author. See below, because the answer decides CODEOWNERS |
| Package manager | **read** the lockfile. Ask only when there is more than one |
| Commit convention scopes | **ask**, and see below |
| Ticket prefix | default `T`, repo-global. Ask only if an issue tracker already owns the ids |
| Stack gates | **read** `package.json`, then step 3 |
| Where the app runs locally | **ask** — port, command, and anything that must not be restarted |

### Rename the package while you are there

`package.json` → `name`. Nothing reads it, so it survives a scaffold as `devx-starter` — and that has a
second consequence: it is the field `setup` keys the `devx.starterSync` check off, so leaving it makes that
check skip in silence. Found that way on a real client repo.

### Replace the README in this same pass

`AGENTS.md` gets filled in because commands read it and a placeholder breaks them. **Nothing reads the
README**, so it is the file that survives a scaffold untouched — and it is the first thing anyone opening
the repository sees. A real client repository shipped with a README that opened `# devx starter` and named
the client zero times.

Write what this repository is, how to run it, and where the process lives. Do not describe the product in
detail — that is the PRD's job and it may not have arrived yet. `bun run setup` refuses to call the README done
while the starter's own title is still in the file.

**On scopes.** The starter ships `commitlint.config.js` with an empty list, which allows any scope — the
right default for one application, because a typo'd scope splits the history and nothing notices. Enumerate
them on day one when the repository holds **more than one deployable**: there, the scope is the only cheap
signal for which application a commit touched, and it is worth being strict about from the first commit
rather than after two hundred.

**That last row earns its place more than it looks.** "Do not restart the Strapi watcher", "port 4000 is
already running with `--watch`" — these are the instructions that get violated by a session that had no way
to know, and the damage is somebody else's afternoon.

## 3. Wire the five gates to this stack

`bun run verify` needs five script **names** in `package.json`: `format:check`, `lint`, `typecheck`,
`test`, `build`. What they run is yours, and nothing here is JavaScript-specific:

```json
"lint": "ruff check .", "typecheck": "mypy .", "test": "pytest -q", "build": "docker build ."
```

Wire `test:coverage` too, emitting `coverage/lcov.info`. Without it the changed-line coverage gate skips —
and skipping is reported, not silent, which is the point.

**A gate you cannot wire yet stays unwired.** `verify` names what it did not run, so green never quietly
means "never checked". Do not point a gate at `true` to make the row disappear; that is the failure this
repository catalogues seven times — a check that asks a cheaper question than the requirement.

### Pin versions against the registry, not against memory

Before writing any version into a manifest, **check what actually exists right now**. Model memory of a
version number is stale by construction, and a wrong pin fails at install time on somebody else's machine
rather than yours. Say which versions you resolved and where from.

A fresh project takes current versions. Copying a pin from a sibling project also copies its patches and
its workarounds — decide that deliberately, and write the reason in `LEARNINGS.md`.

## 4. If the repository has more than one install root

A monorepo with, say, an API, a CMS and a mobile app has three `node_modules` and possibly two package
managers. `bun run verify` runs the root `package.json` only, so a root-only run either needs all three
installed or **quietly checks one of them** — which breaks the single property the script exists for.

Make it iterate, keep the honesty, and let CI run one at a time:

```
── apps/bff        format:check ✓  lint ✓  typecheck ✓  test ✓  build ✓
── packages/types  format:check ✓  lint ✓  typecheck ✓  test —  build ✓
verify: 9/10 gates passed.  NOT WIRED — types:test
```

**The CI trap, and it is worth knowing before you meet it.** Path-filtering the per-root jobs is right —
installing a mobile toolchain on a documentation PR is minutes of nothing. But **a skipped job never
reports a status**, so a required check that is path-filtered leaves the pull request waiting for ever.
Require a single aggregator job with `needs: [each, one]` and `if: always()`, which passes when nothing
failed. `verify` and `spec` must both always report.

## 5. The host — and the one question that decides CODEOWNERS

Until branch protection is set, **every check here is advisory**, because it lives where the person being
checked can edit it. `bun run setup` asks the host directly when `gh` is available, so this is reported
rather than assumed — and reported as **UNVERIFIED** rather than done when it cannot ask.

- **Protect the base branch**: require a pull request, and require `verify` and `spec`
- Every promotion branch, protected the same way
- Delete `phases/001-example-phase/` once the first real phase exists

### Make this repository visible to the starter

Two things, and without them the starter cannot tell whether this repo is current or a year behind:

```bash
gh repo edit <owner>/<repo> --add-topic devx-starter    # this is how the starter finds it
```

…and the starter commit this repo was built from, recorded in `package.json`:

```json
"devx": { "starterSync": "<full sha of devx-starter HEAD>" }
```

`bun run downstream`, run **in the starter**, then lists every repo carrying that topic and how many
starter commits each is behind.

**`starterSync` means "this repo has been considered against the starter up to here" — not "everything up
to here was copied."** Some starter commits have nothing to port: `scripts/downstream.mjs` is the starter
asking about its children, and a client repo has none. Read the commit, port what applies, and bump the
field either way, in the same pull request.

Bumping it for a commit with nothing to port is correct. **Not** bumping it is what breaks the report: the
repo reads as behind for ever, and a report that cries wolf is one nobody reads — which lands you back at
remembering to propagate, the thing this whole mechanism exists to replace.

**Ask who reviews, and let the answer decide.** GitHub will not let anyone approve their own pull request,
so on a one-developer repository a CODEOWNERS rule on `uat` or `prod` is not extra safety — it is a
deadlock whose only exit is an admin bypass on every promotion, which teaches the team that bypassing is
normal.

| Answer | Do |
|---|---|
| more than one reviewer | CODEOWNERS on the promotion branches, owner review required |
| one developer | **no CODEOWNERS.** Write "just me" in the Reviewers row so it reads as a decision |

Do not add CODEOWNERS "for later". Add it when the second reviewer exists.

## 6. Seed LEARNINGS.md

Put in what the team already knows and keeps re-explaining — a library that behaves differently from its
documentation, a config that must be set in two places, a service that must not be restarted. `/ticket`
reads it before asking questions.

This pays for itself faster than anything else here, and it is the one step that is pure profit on day one:
every line is an hour somebody does not spend twice.

## 7. Stop, and say what you could not check

Show the final `bun run setup` output, then say:

- which versions you resolved live, and which you took from a sibling project
- **which gates you actually ran, and which you could not** — a native mobile build, a deploy that needs
  credentials, anything requiring hardware you do not have. Leave the commands and say they are unrun.
  Do not call a build passing that you did not run
- what is left for a person: the host settings, and the inputs that arrive from outside

Then stop. The next command is `/tdd`, and starting a phase is a person's decision.
