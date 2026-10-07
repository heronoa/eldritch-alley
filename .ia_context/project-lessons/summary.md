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
| [depth-layers.lesson.md](./lessons/depth-layers.lesson.md) | `#architecture` `#testing` `#process` | Before a canvas or engine draws by an ordering key, or when a test checks a constant that may no longer govern anything. |
| [title-error-notice.lesson.md](./lessons/title-error-notice.lesson.md) | `#architecture` `#testing` `#process` | Before adding a failure message to a state machine, or measuring contrast for a new text on an existing colour. |
| [new-tab-during-match.lesson.md](./lessons/new-tab-during-match.lesson.md) | `#protocol` `#architecture` `#process` | Before showing a player a refusal the server already decides, or writing a message that covers more than one cause. |
| [m2a.lesson.md](./lessons/m2a.lesson.md) | `#protocol` `#architecture` `#process` | Before writing a server that keeps an engine state private, a reconnection window, or a view whose visual reference is still open. |
| [debt-quick-wins.lesson.md](./lessons/debt-quick-wins.lesson.md) | `#testing` `#process` `#protocol` | Before picking quick fixes from a debt list, or trusting a green run whose suites may not all have run. |
| [map-zoom.lesson.md](./lessons/map-zoom.lesson.md) | `#architecture` `#testing` `#process` | Before zooming a Phaser board that has an overlay, or deciding which coordinate space an input uses. |
| [debt-and-reaction-rules.lesson.md](./lessons/debt-and-reaction-rules.lesson.md) | `#architecture` `#process` `#types` | Before writing a plan of game rules, or changing an approved layer for a later rule. |
| [ea-1-line-of-sight.lesson.md](./lessons/ea-1-line-of-sight.lesson.md) | `#architecture` `#determinism` `#testing` | Before a rule has to exist on both the server and the client, or before writing sight, range or area over a board with height. |
| [ea-2-ea-7-movement-path.lesson.md](./lessons/ea-2-ea-7-movement-path.lesson.md) | `#protocol` `#determinism` `#architecture` | Before changing what an event carries, superseding a plan item, or deciding who computes a path the server must accept. |
| [ea-3-turn-indicator.lesson.md](./lessons/ea-3-turn-indicator.lesson.md) | `#architecture` `#testing` `#process` | Before a visual change whose rule the server already decides, or any work that must not disturb a deterministic hash. |
| [ea-4-auto-end-turn.lesson.md](./lessons/ea-4-auto-end-turn.lesson.md) | `#protocol` `#testing` `#process` | Before automating an action the player used to take, or adding a client setting that changes what the server is asked to do. |
| [ea-5-range-display.lesson.md](./lessons/ea-5-range-display.lesson.md) | `#architecture` `#determinism` `#process` | Before drawing a highlight the player will read as a promise, or closing a feature whose acceptance rests on a manual check. |
| [ea-6-enemy-ranges.lesson.md](./lessons/ea-6-enemy-ranges.lesson.md) | `#architecture` `#process` `#testing` | Before showing the player information the fog of war would hide, or deciding what a highlight means when two units overlap. |
| [ea-8-sprite-target.lesson.md](./lessons/ea-8-sprite-target.lesson.md) | `#architecture` `#testing` `#process` | Before a drawing change whose geometry a hit test depends on, or when a debt is split across two features. |
| [ea-12-camera.lesson.md](./lessons/ea-12-camera.lesson.md) | `#architecture` `#testing` `#process` | Before a view transform over an interactive surface, or any visual feature larger than one review. |
| [ea-14-ranged-and-mana.lesson.md](./lessons/ea-14-ranged-and-mana.lesson.md) | `#architecture` `#types` `#protocol` | Before adding a second resource, a new field to a widely-built type, or a refusal that has to order several reasons. |
| [debt-dt73-validate-moved-path.lesson.md](./lessons/debt-dt73-validate-moved-path.lesson.md) | `#determinism` `#testing` `#types` | Before applying an event the engine did not compute, or validating the output of another function. |
| [debt-lot-1-cleanup.lesson.md](./lessons/debt-lot-1-cleanup.lesson.md) | `#process` `#testing` `#architecture` | Before a low-risk cleanup lot, editing an accepted ADR, or closing a debt whose fix already shipped. |
| [smoke-test-2-feedback.lesson.md](./lessons/smoke-test-2-feedback.lesson.md) | `#architecture` `#process` `#testing` | Before laying out HUD panels over a board, moving input rules out of a scene, or turning a smoke test's feedback into slices. |

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
