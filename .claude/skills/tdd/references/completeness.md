# Is this TDD finished?

Two parts. The **scan** finds what is missing before you ask questions. The **test** decides whether the
finished document clears the bar.

---

## Part 1 — the ambiguity scan

Before asking anything, mark every category **Clear / Partial / Missing**. A category you did not look at
is Missing, not Clear.

### Scope and behaviour
- what this phase delivers, and what it explicitly does not
- who the users are, and what differs between roles
- success criteria that can be checked rather than admired

### Domain and data
- entities, attributes, types, relationships
- identity and uniqueness — what makes two records the same record
- lifecycle: the states a thing can be in, and which transitions are legal
- volume and growth, if either changes the design

### Interaction
- the critical journeys, start to finish
- **error, empty and loading states** — the three that get discovered in review
- accessibility and localisation, where they apply

### Non-functional
- performance as **numbers**: latency target, throughput, payload size
- reliability: what happens when a dependency is down
- observability: what gets logged, what gets measured, what pages someone
- security: authentication, authorisation, what data is sensitive and why

### Integration
- every external service, its real response shape, and **its failure modes**
- import/export formats
- versioning: what happens when their API changes

### Edge cases
- the negative paths
- rate limiting and throttling
- **concurrency** — two people editing the same thing at the same moment
- idempotency: what happens when the same request arrives twice

### Constraints and trade-offs
- technical constraints that are fixed rather than chosen
- decisions taken, each with the alternative rejected and why

### Terminology
- the canonical name for each concept, and the synonyms **not** to use. Two names for one thing becomes
  two implementations of it

### Completion
- acceptance criteria that resolve to evidence
- what "done" means for this phase, as a list of demonstrable things

**Ambiguous adjectives are Missing, not Partial.** "Robust", "fast", "intuitive", "scalable", "secure"
carry no decision. Replace each with a number or a named mechanism, or ask.

---

## Part 2 — the completeness test

### The checklist

| | The document contains |
|---|---|
| **Paths** | real directories and filenames, matching the repository's actual layout — never "the service layer" |
| **Structure** | its **organising principle** stated, and on a greenfield phase a decision row with the shape that lost. Every file the phase creates is in the tree — tests, fixtures and type declarations included |
| **Contracts** | request shape, response shape, status codes, **and every error code with what triggers it** |
| **Entities** | field names, types, nullability, constraints, indexes, and the uniqueness rule |
| **Lifecycle** | the legal state transitions, and what is refused |
| **Concurrency** | what happens on a simultaneous write, stated — even if the answer is "last write wins, deliberately" |
| **Decisions** | each with the alternative rejected and the reason |
| **Numbers** | every performance or scale claim quantified |
| **External shapes** | observed from the live system, committed as a fixture, and cited |
| **Tests** | which level proves what, and what "done" demonstrates |
| **Open questions** | each with an owner and what it blocks |
| **Markers** | **zero `[NEEDS CLARIFICATION]` remaining** |

A row that cannot be filled is an open question. It is never a blank.

### The dry run — this is the part that actually decides

The checklist can be satisfied by a document that is still unbuildable. So do this:

> **Pick three tasks you would cut from this document — one foundational, one mid-stack, one at the
> edge — and try to implement each from the document alone.**

For each, answer concretely:

1. Which files do I create or change? *Named, not described.*
2. What exactly goes in them — field names, function signatures, status codes?
3. How do I know it works? Which test, asserting what?
4. What do I do when the input is wrong, missing, or arrives twice?

**Any question you cannot answer from the document is a hole in the document, not a gap in the task.**
Fix the document and run the three again.

Say in your closing message which three you dry-ran and whether each survived. A TDD nobody dry-ran is a
TDD whose first task discovers the holes — and that discovery costs a branch, not a paragraph.

### What this deliberately does not require

Not every design needs every section. A phase with no external services has nothing to write under
Integration, and padding it produces prose nobody reads.

**Say "not applicable" and why.** An empty section is ambiguous — nobody can tell whether it was
considered and dismissed, or never considered. One sentence removes that doubt for ever.
