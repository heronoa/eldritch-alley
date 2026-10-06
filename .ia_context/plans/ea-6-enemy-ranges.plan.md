# Plan: EA-6 · Show enemy ranges on hover or tap

**Milestone:** lot 2 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-5 (`attackArea`, `threatArea`); EA-2 (`reachableCells`)
**Created:** 2026-10-05
**Status:** ready for review

## 1. Objective

Hovering (desktop) or long-pressing (mobile) an enemy shows its movement and attack range, in the enemy colour. It does not change the selected unit and sends no action.

## 2. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/movement.ts` | modify | `reachableCellsFor(state, unitId)`: the reachable set of any living unit as if it had the turn and its full movement. `reachableCells` (EA-2) keeps its rule: empty when the unit does not have the turn |
| `src/movement.test.ts` | modify | Test for the preview variant |

**Why a separate function.** EA-2's `reachableCells` is empty for a unit without the turn, which is the right answer for the move action. A preview of an enemy needs the same geometry with the enemy's full movement. Reusing the rule keeps the preview and the action in agreement.

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/game/highlight.ts` | modify | Preview mode: paints `reachableCellsFor` and `threatArea` of the hovered or pressed enemy, in the enemy colour |
| `src/game/selection.ts` | modify | Hover and long-press produce a `preview` intent, separate from `select`. No action |
| `src/scenes/MatchScene.ts` / `scenes/units.ts` (files to confirm) | modify | Pointer hover on desktop (`pointerType === 'mouse'`); long press of about 400 ms on touch, cancelled when the finger moves more than 6 px |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Legend text for enemy preview if needed |
| Tests: `selection.test.ts`, `highlight.test.ts` | modify | Section 4 |

**Input rules** (from the camera handoff, section 2): hover exists only for the mouse; touch uses long press; a tap shorter than 400 ms is a normal tap (selects or acts); a gesture that moves more than 6 px is a pan, never a preview.

## 3. Contract of the layer

- **`reachableCellsFor(state, unitId): Position[]`**: pure. Empty for a dead unit. Does not depend on the turn.
- **Preview intent**: `{ kind: 'preview', unitId }` from `resolveClick` (or the hover handler) when the target is an enemy and no action is armed. Never a `send`.
- **Not done by this layer:** changing the selection, spending an action, and the human's own turn logic.

## 4. Tests planned

Engine:
- [ ] `reachableCellsFor` of an enemy with the turn elsewhere: non-empty, same cells as if it had the turn with full movement.
- [ ] `reachableCellsFor` of a dead unit: empty.
- [ ] `reachableCells` (EA-2) still returns empty for a unit without the turn (no regression).

Client:
- [ ] Hovering an enemy with the mouse paints its reachable set and threat area in the enemy colour.
- [ ] A long press of 400 ms on an enemy paints the same, and a release does not send an action.
- [ ] A pointer that moves more than 6 px before 400 ms is a pan: no preview.
- [ ] Hover does nothing on touch input.
- [ ] Previewing an enemy does not change the selected unit.
- [ ] Previewing an enemy sends no action message.

## 5. Dependencies

- EA-5 (attack area and threat area).
- EA-2 (reachable cells geometry).

## 6. Decisions (proposed, not yet confirmed)

- **D1. What the preview shows for an enemy:** reachable set plus threat area (recommended, consistent with EA-5), or only the threat area (simpler).
- **D2. Long press duration:** 400 ms, from the camera handoff. Tune on a phone.

## 7. Out of scope

- Selecting an enemy (only the owner's units are selectable).
- Camera (EA-12).
- Target clicks on sprites (EA-8).
