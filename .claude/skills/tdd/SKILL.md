---
name: tdd
description: Use when writing or extending the technical design for a phase — turning a PRD into a document complete enough that every task cut from it can be implemented without asking the author a question. Covers checking the inputs exist, verifying contracts against the deployed system, a structured ambiguity scan, bounded clarification, and the completeness test the document must pass before it counts as finished.
user-invocable: true
argument-hint: <phase-slug>
---

# Writing a TDD

Produce `phases/<NNN>-<slug>/tdd.md`, where `NNN` is the next unused three-digit number in `phases/`.

**The bar this document has to clear:** a developer — or an agent — picks up any task cut from it and
implements the task without asking you anything. Not "understands the intent". *Implements it.*

Everything below exists to reach that bar. `references/completeness.md` is how you prove you did.

## 1. Check the inputs exist

Read `docs/inputs/sow.md` and `docs/inputs/prd.md`. If either is missing, **stop and say which one.**
These arrive from the practitioner and scope owners. Do not write them — writing the PRD means
authoring the scope the client is held to, with no second party left to confirm it.

Phase boundaries come from the SOW: it is the commercial document, and moving a phase is re-deciding
what the client is paying for.

### When an engagement has no separate PRD

Some do not. The requirements sit in the SOW, or in a signed annexe, and no second document was ever
produced. **"Has not arrived yet" and "does not exist" are different states**, and until the repository
records which one it is in, every command reads the second as the first — so `next` asks for a PRD for
ever and the project has no legal way forward.

So record it. `docs/inputs/prd.md` may be a **pointer** rather than a requirements document:

```markdown
# PRD

> **Pointer, not a PRD.**

There is no separate PRD for this engagement. The requirement layer is `sow.md` §03 —
module capabilities, each with capability IDs and acceptance criteria.
```

Three rules, and they are what stop this becoming a way to dodge writing a PRD that should exist:

- **It must name where the requirements are** — a document and a section. A pointer that cannot name one
  is not a pointer, it is an excuse, and the honest move is to stop and ask for the PRD.
- **It carries no requirements of its own.** The moment it starts describing what the product does, it is
  a PRD you wrote, which is the thing this step exists to prevent.
- **The marker line is literal.** `bun run setup` greps for it, so its report distinguishes a pointer from
  a real PRD instead of calling both "present".

Then carry on: read the section it names as the requirement layer, and say so in step 8.

## 2. Gather

- the SOW and PRD sections covering this phase
- **every earlier `phases/*/tdd.md`** — later phases build on decided things. Silently re-deciding one is
  how two phases end up with two different auth models
- `LEARNINGS.md`
- the codebase as it stands: its real directory layout, its conventions, what already exists

## 3. Verify against the deployed system, not the document describing it

**This step decides whether the contracts in the finished document are true.**

For every system this phase touches — a CMS, an internal API, a third-party service, an existing table —
read the live thing: query the schema, call the endpoint, look at the actual response body. For a
third-party service, read its current public documentation rather than your memory of it.

Where the running system and the document disagree, **the running system wins** and the document is
corrected. Say which of the two each contract was written from.

Commit what you fetched as a fixture under the phase directory, and read the file afterwards. A contract
written from a document that has drifted is found by the client, after the code exists.

If a system cannot be reached, that is an **open question with an owner** — never an assumption written
down as fact.

## 4. Scan for ambiguity before asking anything

Walk `references/completeness.md`'s taxonomy and mark every category **Clear / Partial / Missing**. This
is what makes the questions systematic rather than whatever occurred to you.

Write `[NEEDS CLARIFICATION: <the question>]` inline wherever you would otherwise guess. They are
allowed to exist while drafting. **None may survive step 7.**

## 5. Ask — at most five, one at a time

Rank the Partial and Missing categories by **impact × uncertainty** and take the top five. Ask only what
would change the architecture, the data model, how tasks decompose, how it gets tested, or what the
client is owed. A question that changes none of those is not worth the interruption.

Use AskUserQuestion, **one question per turn**, with:

- your **recommendation first**, and one sentence on why — best practice for this stack, the pattern the
  codebase already uses, or the lower risk
- 2–5 mutually exclusive options
- an honest consequence for each, not a sales pitch for your favourite

Record every answer in the document **in the developer's own words**. A paraphrase loses the reason, and
the reason is what the next person needs.

If five is not enough, the remainder become **open questions**, listed with an owner and what each
blocks. It is far better to ship a TDD that says "this is unresolved and it blocks T012" than one that
quietly guessed.

## 6. Write

Follow `references/template.md`. Two rules that carry most of the weight:

- **Real paths, real names, real shapes.** Not "the service layer" but `src/modules/checkout/`. Not
  "returns an error" but `409 { error: "version_conflict", currentVersion: number }`.
- **Every decision names the alternative that lost, and why.** Without it, month three re-opens it
  without the context and picks differently.

## 7. Prove it is finished

Run the completeness test in `references/completeness.md`. It is a checklist and a falsifiable exercise,
not a feeling — and the exercise is the important half: pick three tasks you would cut from this
document and try to implement each one from the document alone.

Any `[NEEDS CLARIFICATION]` still present is either answered now or promoted to an open question with an
owner. **A marker left in the delivered document is the failure this whole skill exists to prevent.**

## 8. Stop

Show me the document and say plainly:

- which contracts you verified against a live system, and which you took from a document
- what remains open, who owns each, and what it blocks
- which three tasks you dry-ran in step 7, and whether each survived

Do not cut tasks. That is `cut`, and it happens after a person has read this.
