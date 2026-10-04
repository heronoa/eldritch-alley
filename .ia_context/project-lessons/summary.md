# Project lessons

Distilled knowledge from closed features. A lesson is not a summary of what was built — the MR
description and the code already say that. A lesson answers **"what would I need to know before doing
this again?"**, so it is written to be read *before* a similar piece of work, not after.

Written at the close of a feature (`/close-feature`), from its plan, its MR description and any
debugging notes. One file per feature in [`lessons/`](./lessons/).

## Index

| Lesson | Tags | Read it when |
|---|---|---|
| [engine-m1.lesson.md](./lessons/engine-m1.lesson.md) | `#determinism` `#architecture` `#testing` `#process` `#types` | Before writing any state that must be rebuildable from a log, any rule the compiler cannot enforce, or anything nondeterministic that has to survive a replay. |

## Tag glossary

Pick 3 to 5 tags per lesson, from this list only. A tag is added here before it is first used, so the
set stays small enough to browse.

| Tag | Means |
|---|---|
| `#architecture` | Boundaries between layers, contracts, what a module is allowed to know |
| `#determinism` | Integer math, seeded randomness, replay, reproducibility |
| `#protocol` | The wire between server and client, and how it changes |
| `#testing` | What to test, how to make a rule enforceable, test process |
| `#process` | Planning, the TDD cycle, review and MR hygiene |
| `#types` | Type design and how it ages |
