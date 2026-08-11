# prompts/

Build briefs written to be handed to a coding model as a first message. They are
specifications, not descriptions: every section either constrains a decision,
fixes a number, or defines a test that proves the work is real.

| File | What it builds |
| --- | --- |
| [`grimward-gothic-rpg.md`](grimward-gothic-rpg.md) | **GRIMWARD** — a *Gothic II: Night of the Raven*–class open-world action RPG that runs in a browser tab at 60 fps, with no engine, no runtime dependencies and no binary assets. |

## How to use one

Create an empty repository, paste the whole file into the model as its first
message, and add exactly one line:

> Start at §14 Milestone M0. Do not skip the Contract in §3.

Nothing else. Adding your own summary on top is the fastest way to lose the
parts that matter — the brief is already ordered so the model reads the
anti-hallucination contract before it reads anything it might enjoy writing.

## Why they are shaped like this

The failure mode for "build me a AAA game" is not bad code. It is a model that
invents the design as it goes, writes six thousand lines that never ran, and
reports success. So each brief carries four things that a normal spec does not:

- **A Contract on evidence.** No claim about the running game without the command
  that produced it and its real output. No feature without a test in the same
  commit. Frame-time numbers only from the perf probe.
- **Labelled facts.** Reference numbers carry `[V]` (corroborated), `[C]` (single
  community source) or `[D]` (our decision). A number cannot be copied into code
  without its label coming along in the comment, which makes a guess dressed as a
  fact visible in review.
- **Scope honesty up front.** The brief states what the original team's headcount
  and schedule were, states what is actually achievable, and instructs the model
  to cut content rather than systems when it runs out of room.
- **Exit criteria that are commands.** Every milestone ends with something a
  stranger can run and something a stranger can see.

There is also one deliberate trap: the Understanding Check asks the model to name
something in the document it thinks is wrong. A model that finds nothing has not
read carefully enough to be trusted with the rest.
