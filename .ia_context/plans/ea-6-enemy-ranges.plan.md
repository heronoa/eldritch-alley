# Plan: EA-6 · Inspect an enemy's attack area

**Milestone:** lot 2 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-5 (`attackArea`, and the one-area-per-state rule)
**Created:** 2026-10-05
**Revised:** 2026-10-06 — the inspection shows the attack area only, on a fixed secondary gesture; the movement set and the threat area are gone (sections 6 and 7)
**Status:** ready for review

## 1. Objective

Inspecting a unit that does not have the turn — an enemy, in this ticket's scope — shows one area: the cells it could attack from where it stands. Nothing else is painted. The inspection changes neither the acting unit nor the turn, and sends no action; when it closes, the highlight of the current state comes back on its own.

## 2. Changes by layer

### Engine (`backend/engine`)

**No change.** `attackArea(state, from, unit)` (EA-5) already takes the unit and the cell, so it answers for a unit that does not have the turn without a second function. `reachableCellsFor` and `threatArea` are removed from this plan (section 6).

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/game/highlight.ts` | modify | The inspection set: `attackArea` from the position of the inspected unit, one set alone |
| `src/game/selection.ts` | modify | The secondary gesture produces an `inspect` intent, separate from `select`. Never a `send` |
| `src/scenes/MatchScene.ts` | modify | The pointer gesture; paints the inspection set, and puts the state's own set back when the inspection closes |
| `src/view/theme.ts` | no change | The colour is the one already used today for an enemy that is a possible target: `HIGHLIGHT_ATTACK_COLOR` (`src/view/theme.ts:74`, `= ACCENT_COLOR`, drawn at `src/scenes/MatchScene.ts:649`). No new colour |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Legend line for the inspection, if needed |
| Tests: `selection.test.ts`, `highlight.test.ts` | modify | Section 4 |

**Input rules** (from the camera handoff, section 2): the secondary gesture is the right button on desktop; touch uses long press; a tap shorter than 400 ms is a normal tap (selects or acts); a gesture that moves more than 6 px is a pan, never an inspection. The primary click is never the inspection (section 6, D4).

## 3. Contract of the layer

- **What is shown.** `attackArea(state, unit.position, unit)` of the inspected unit, in a single set, in `HIGHLIGHT_ATTACK_COLOR`. No movement set, no threat set, no layer combining them.
- **Read-only.** The inspection does not change the acting unit (`state.currentIndex` stays where it is), does not change the turn, spends nothing and sends nothing. It is neither a selection nor a preview of an action.
- **Closing.** When the inspection closes, the highlight of the current state returns by itself: the inspection never edits the state the highlight is derived from.
- **Not done by this layer:** selecting an enemy, spending an action, the human's own turn logic.

## 4. Tests planned

Engine: no test of its own; `attackArea` is covered by EA-5.

Client:
- [ ] Inspecting an enemy paints exactly `attackArea` from its position, and holds no movement cell.
- [ ] The inspection set and the current state's set are never painted together.
- [ ] The colour is `HIGHLIGHT_ATTACK_COLOR`, the one already used for a targetable enemy.
- [ ] Inspecting does not change the acting unit.
- [ ] Inspecting sends no action message.
- [ ] When the inspection closes, the highlight of the current state returns.
- [ ] The secondary gesture fires no action while a move is pending, nor while the attack is armed (section 6, D4).

## 5. Dependencies

- EA-5 (`attackArea` and the one-area-per-state rule; the pending state this gesture has to stay clear of).
- EA-8 reads the same attack area for the click target.

## 6. Decisions

### Decided (owner, 2026-10-06)

- **D1. The inspection shows only the attack area.** One set, from the position the inspected unit stands on. No movement set: where an enemy could walk is a question this game never asks the player, and painting it next to the attack area is the second layer the one-area rule forbids.
- **D2. The inspection is read-only and restores.** It changes neither the acting unit nor the turn, and when it closes the highlight of the current state returns.
- **D3. No `threatArea`, no `reachableCellsFor`.** The engine gains no function for this ticket: `attackArea` is the whole rule. `threatArea` was removed by EA-5 (D2 there) and no dependency on it survives here.
- **D4. The inspection gesture is fixed and secondary.** In MovePending and in the attack, a primary click on an enemy means choosing it as the target, so the inspection never takes the primary click. It takes the right button on desktop and a long press on mobile, in every state, and the primary click is always an action. The thresholds stay as the camera handoff describes them: 400 ms, cancelled by a movement over 6 px.

### Open questions

- None.

## 7. Out of scope

- Selecting an enemy (only the owner's units are selectable).
- Camera (EA-12).
- Target clicks on sprites (EA-8).
- The movement set of an enemy, removed with the one-area rule.
