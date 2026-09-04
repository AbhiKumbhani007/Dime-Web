# Does this ticket need a review now, or at the checkpoint?

**The default is the checkpoint.** Most tickets are reviewed with their feature, not on their own — that is
where cross-ticket problems are visible anyway, and reviewing every branch separately spends a lot to
re-read the same code from four angles.

Two things override that default.

## 1. Review immediately, three lenses — `spec`, `correctness`, `security`, concurrently

Not a judgement call. The list is short and literal, and it is short on purpose:

- **authentication or authorisation** — code that decides *who may do what*
- **money** — anything that debits, refunds, prices or bills
- **a migration**, or any destructive or irreversible data operation
- **a concurrency primitive** — a lock, a transaction isolation level, a counter under contention, an
  idempotency key

That is the whole list. **Nothing else is on it**, and the reason it is written this literally is that a
wider version leaked immediately: "a public contract a consumer will build against" was on it once, and
every endpoint ticket qualifies under that reading. A ticket that merely validated a URL scheme burned
68,000 tokens on three reviewers and found nothing.

**Adjacency does not count.** Validating a URL scheme is not authentication — it is ordinary input
correctness, and the feature checkpoint covers it. A ticket that *returns* an error code is not a
concurrency ticket. If you find yourself constructing an argument for why something belongs on this list,
**that construction is the signal that it does not.** The list is meant to be boring to apply.

**At most one three-lens review per feature.** If a second ticket in the same feature seems to qualify, say
so rather than running it — that is usually a sign the feature is doing too much, and it is a better
finding than the review would have been.

This is the same list step 5 of the skill uses to decide whether to pause before coding. One list, two
decisions, on purpose: if a ticket is risky enough that a person should read the plan, it is risky enough
to review the diff.

## 2. Review immediately, one lens, when you have an actual reason

Not a size threshold — a real signal you noticed while working:

- you were **unsure** about an approach and picked one anyway
- you **changed approach** partway through the ticket
- a check went red and you changed code to make it green
- you touched something you do not fully understand
- you wrote a test and could not convince yourself it would fail against a broken implementation

These are honest self-signals, and they predict defects far better than a line count does. A 400-line
ticket you were sure of the whole way is safer than a 40-line one where you were guessing.

**This path is still the exception.** "I was unsure" means doubt you could not resolve by reading the code
— not the ordinary uncertainty of writing anything. On most tickets the honest answer is "checkpoint", and
saying it is not a failure to be thorough.

## Say which you chose, every time

"Checkpoint — nothing about this ticket worried me" is a fine answer and a useful one. What is not fine is
silence: a review nobody ran and a review that found nothing look identical afterwards, and only one of
them is evidence.

## How to dispatch

Give the **reviewer** subagent the base and head SHA, the spec path, and **one lens**. It has no Write or
Edit tools, so it can only report. When three run they are independent, so they run concurrently.

Its findings are input, not verdicts. Dismiss the wrong ones **in writing** — its accuracy is unmeasured,
and an unrecorded dismissal is indistinguishable from not having read it.

## At a feature checkpoint — where the batched review actually happens

When the ticket you just finished is the **last in its feature**, dispatch **phase-reviewer** across that
feature's tickets. When it is the last in the whole **phase**, scope it to the phase instead.

This is the counterweight to reviewing fewer tickets individually. It looks for what no per-ticket pass can
see, because a per-ticket reviewer only ever holds one branch:

- two tickets solving the same problem differently
- a contract defined in one ticket and broken in another
- a helper written twice under different names
- **code that has drifted from `tdd.md`**

That last one matters most. It is the cheapest moment to correct the design, and the last one before the
next feature builds on a stale version of it.

**This one is not optional.** Per-ticket review is the exception precisely because this runs — skip it and
a whole feature goes unexamined, which is worse than reviewing every ticket ever was.
