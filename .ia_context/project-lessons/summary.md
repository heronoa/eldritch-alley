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
| [localization.lesson.md](./lessons/localization.lesson.md) | `#architecture` `#testing` `#process` | Before adding a second language to a client without a library, or any refactor that must not change visible text. |
| [bundle-size.lesson.md](./lessons/bundle-size.lesson.md) | `#architecture` `#testing` `#process` | Before splitting a bundle, touching `manualChunks`, or closing a debt that names a build metric. |
| [debt-dt60-reconnect.lesson.md](./lessons/debt-dt60-reconnect.lesson.md) | `#protocol` `#architecture` `#testing` | Before deciding whether to clear a stored reconnection token, or designing how a player resumes a seat across tabs and devices. |
| [iso-board.lesson.md](./lessons/iso-board.lesson.md) | `#architecture` `#testing` `#process` | Before drawing a projected or overlaid view over an interactive surface, or when a plan's file names may have moved. |
| [visual-identity.lesson.md](./lessons/visual-identity.lesson.md) | `#architecture` `#testing` `#process` | Before restyling a Phaser client, or any palette that has to pass a readability floor on its states. |
| [title-screen.lesson.md](./lessons/title-screen.lesson.md) | `#architecture` `#testing` `#process` | Before building an entry screen with animation and a network connection, or writing a contrast matrix. |
| [map-variety.lesson.md](./lessons/map-variety.lesson.md) | `#determinism` `#protocol` `#process` | Before writing a feature whose definition of done is its own deliverables, or a random choice in match setup. |
| [map-fidelity.lesson.md](./lessons/map-fidelity.lesson.md) | `#protocol` `#architecture` `#testing` | Before sharing terrain data between client and server, or writing a reachability rule for a grid. |
| [m2a.lesson.md](./lessons/m2a.lesson.md) | `#protocol` `#architecture` `#process` | Before writing a server that keeps an engine state private, a reconnection window, or a view whose visual reference is still open. |
| [debt-quick-wins.lesson.md](./lessons/debt-quick-wins.lesson.md) | `#testing` `#process` `#protocol` | Before picking quick fixes from a debt list, or trusting a green run whose suites may not all have run. |
| [map-zoom.lesson.md](./lessons/map-zoom.lesson.md) | `#architecture` `#testing` `#process` | Before zooming a Phaser board that has an overlay, or deciding which coordinate space an input uses. |
| [debt-and-reaction-rules.lesson.md](./lessons/debt-and-reaction-rules.lesson.md) | `#architecture` `#process` `#types` | Before writing a plan of game rules, or changing an approved layer for a later rule. |

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
