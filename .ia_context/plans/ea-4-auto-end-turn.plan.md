# Plan: EA-4 · Automatic end of turn, with a setting to disable it

**Milestone:** lot 1 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-2 (the reachable set decides "nothing left to move"); ADR 0010 (round on `endTurn`)
**Created:** 2026-10-05
**Status:** ready for implementation (decisions closed 2026-10-05)

## 0. Findings

- The engine has an `endTurn` action. `validateAction` checks only game over and the unit with the turn (`not-your-turn`). Nothing else. So a late or repeated `endTurn` can end the next turn if the same unit is up again, or the next unit's turn when the message arrives late. That is the risk the owner named.
- The client shows the "End turn" button (`available.canEndTurn` in `frontend/src/game/actions.ts`). Players do not know they must press it.
- "Can this unit still act?" is decided by the engine, so client and server agree.

## 1. Objective

When the active unit has nothing left to do, the turn ends. The player sees a 2-second countdown, with a link to turn the setting off. The setting is on by default. With it off, the "End turn" button is highlighted once nothing else can be done.

## 2. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/actions.ts` | modify | New exported `canStillAct(state): boolean`. `validateAction`: an `endTurn` whose `round` differs from the match's current round is refused with `stale-turn` (after `not-your-turn`) |
| `src/types.ts` | modify | `endTurn` action gains `round: number`; `RejectReason` gains `'stale-turn'` |
| `src/index.ts` | modify | Export `canStillAct` for the client |
| `src/actions.test.ts` | modify | Section 4 |

**"Nothing left" rule (`canStillAct` returns true when any holds):**
- the unit has not acted and has a reachable cell (`reachableCells`, EA-2);
- the unit has not acted and a target is in reach and in sight (EA-1);
- the unit has not acted and reload is allowed (`validateReload` passes).

Meditation (EA-14) joins this rule later; the rule is one function, so the change is local.

The engine does not end the turn. `canStillAct` only answers the question.

### Server (`backend/game-server`)

No timer on the server (decision D1, closed). The server passes `endTurn` through; the engine's `round` check does the protection.

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/protocol.ts` | modify | `endTurn` carries `round`; `'stale-turn'` added to `RejectReason` |
| `src/game/actions.ts` | modify | Add `nothingLeft: boolean` from `canStillAct` (imported from the engine) |
| `src/game/autoEndTurn.ts` | create | Pure state machine: `idle → counting(2 s) → sent`, with `cancel` and `disable`. Inputs: `nothingLeft`, the setting, elapsed time |
| `src/game/autoEndTurn.test.ts` | create | Section 4 |
| `src/scenes/HudScene.ts` | modify | Countdown text "Turno encerrado em 2 s" with a link "não passar automaticamente" (turns the setting off) and a cancel action |
| Settings panel (new, minimal) | create | Opened by a gear icon in the corner of the screen. One option: "Passar o turno automaticamente", on by default |
| Gear icon | create | In the corner of the screen, outside the action bar (decision D3, closed) |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Countdown, cancel, link, settings and hint texts |
| `src/i18n/storage.ts` (existing pattern) | reuse | Setting key `eldritch-alley.autoEndTurn`, default `true`; every read and write in try/catch |

**Countdown rule.** When `nothingLeft` becomes true and the setting is on, the countdown starts at 2 s. Cancel stops the countdown and keeps the turn open. Acting again (`nothingLeft` becomes false) also stops it. When the countdown reaches 0 the client sends `endTurn` with the current `round` and the active unit as `actor`.

**Setting off:** nothing is sent. The "End turn" button pulses and shows a hint once `nothingLeft` is true.

## 3. Contract of the layer

- **`canStillAct(state): boolean`**: pure. False when the match is over or the unit with the turn has acted.
- **`endTurn { actor, round }`**: accepted only when `actor` has the turn and `round` is the current round. Otherwise `not-your-turn` or `stale-turn`.
- **`autoEndTurn` machine**: input events `nothingLeftOn`, `nothingLeftOff`, `tick(ms)`, `cancel`, `disable`, `settingChanged`. Output: the new state, and a flag `send` when `endTurn` should go out.
- **Setting storage:** a read or write failure falls back to the default (on) and does not throw.

## 4. Tests planned

Engine (`actions.test.ts`):
- [ ] Unit with a reachable cell and no action taken: `canStillAct` true.
- [ ] Unit with nothing reachable, no target in reach or sight, magazine full: false.
- [ ] Unit with a target in reach and in sight but no movement: true.
- [ ] Unit that has acted: false, even with movement left.
- [ ] Empty magazine and no target in reach: true (reload is available). **The ticket says reload is a valid choice.**
- [ ] Match over: false.
- [ ] `endTurn` with the current round: accepted.
- [ ] `endTurn` with an old round: refused `stale-turn`, state unchanged. This is the late-message case.
- [ ] `endTurn` from a unit that does not have the turn: `not-your-turn`.

Client (`autoEndTurn.test.ts`):
- [ ] Setting on, `nothingLeft` true: countdown starts at 2 s and sends `endTurn` after 2 s, with the round.
- [ ] Cancel during the countdown: nothing is sent; the countdown restarts only when `nothingLeft` goes off and on again.
- [ ] `nothingLeft` goes false during the countdown: stops, nothing sent.
- [ ] `disable` during the countdown: stops, nothing sent, setting saved as off.
- [ ] Setting off: nothing sent; the button state is `hinting`.
- [ ] Storage read or write throws: setting falls back to on, no exception.
- [ ] Turn does not end while an action is available, even with no target in range (reload case).

## 5. Dependencies

- **EA-2**: `reachableCells`.
- **EA-1**: `hasLineOfSight` for the "target in reach and in sight" rule.
- **ADR 0010**: `round` on `endTurn`.
- EA-3 touches `HudScene.ts` too; merge EA-3 first if they overlap.
- EA-14 later adds meditation to `canStillAct`.

## 6. Decisions (closed 2026-10-05)

- **D1. Who sends `endTurn`:** the client, after 2 s, with `round` and `actor`. No timer on the server in this lot. The engine refuses stale or misdirected commands with `stale-turn` or `not-your-turn`, so a late or repeated message cannot end the next turn.
- **D2. Default:** on, stored in the browser until accounts exist.
- **D3. Setting location:** a gear icon in the corner of the screen opens a minimal settings panel with the toggle. The countdown has a link "não passar automaticamente" that turns it off. Not in the action bar.

## 7. Out of scope

- Meditation as an action (EA-14).
- Turn timer and inactivity rules (ADR 0004, M5).
- The turn banner (EA-3).
- Server-side turn timer.
- Any change to the rule that `endTurn` is accepted at any time in the turn, beyond the round check. Requiring "nothing left" to end a turn early is not part of this ticket.
