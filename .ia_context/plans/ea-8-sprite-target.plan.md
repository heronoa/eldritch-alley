# Plan: EA-8 · Attack by clicking the target's sprite or portrait

**Milestone:** lot 2 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-5 (attack area); EA-1 (line of sight shown as the refusal reason)
**Created:** 2026-10-05
**Status:** ready for review

## 1. Objective

In attack mode, a click anywhere on an enemy's sprite selects it as the target, not only its floor cell. Clicking an enemy portrait in the turn queue selects it too. An invalid target shows the reason instead of nothing happening.

## 2. Findings

- `resolveClick` (`frontend/src/game/selection.ts`) finds the occupant by **cell**. A click on a sprite whose cell is not the target's floor cell (a tall sprite drawn over the cell above) is not an attack.
- The sprite of a unit extends above its cell. The hit area must use the drawn sprite, not the cell only.
- The turn queue portraits are in `HudScene.ts`; they have no click action for enemies today.

## 3. Changes by layer

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/game/selection.ts` | modify | `resolveClick` takes a target from either a cell or a unit id (sprite hit). The unit id path uses the same rules as the cell path: team, defeated, reach, sight |
| `src/game/hit.ts` | create | Pure function: `unitAtPoint(units, point, layout)`: the unit whose sprite bounds (plus a 4 px margin) contain the point; nearest by depth when two overlap |
| `src/game/hit.test.ts` | create | Section 4 |
| Map view (file to confirm, `scenes/map/MapView.ts` or `scenes/units.ts`) | modify | Pointer up on the map calls `unitAtPoint` before the cell lookup |
| `src/scenes/HudScene.ts` | modify | Turn queue portrait click on an enemy sends the same target intent |
| `src/game/log.ts`, i18n catalogs | modify | Reason shown when the target is invalid: out of range, no line of sight, no ammunition (reason codes from the engine) |
| Tests: `selection.test.ts` | modify | Section 4 |

**Hit area (decision D1).** The sprite bounds, plus a 4 px margin, so a target is easy to hit on a phone. The margin is in screen pixels, not map cells, so it is the same at every zoom.

**Depth.** Two sprites can overlap. The nearest by depth (the one drawn on top) wins, so the click matches what the player sees.

**Invalid target.** An enemy outside reach or without line of sight is not a target. The click shows the engine's reason through the log (existing `log.ts` path), not silently.

## 4. Contract of the layer

- **`unitAtPoint(units, point, layout): UnitState | null`**: pure. Returns the top-most unit whose sprite area contains the point, or null.
- **`resolveClick`** with a unit target: returns `send { attack }` when valid, or `none` with a `refusal` reason (new intent kind `refused`) when the engine would refuse. The refusal list comes from the same predicates the engine uses (`attackArea`, EA-5).
- **Not done by this layer:** the engine rules (unchanged), the sprite art (unchanged).

## 5. Tests planned

Unit (`hit.test.ts`):
- [ ] A point on the upper body of a sprite, over its floor cell's neighbour, returns that unit.
- [ ] A point 4 px outside the sprite returns that unit; 5 px outside returns null.
- [ ] Two overlapping sprites: the one drawn on top wins.
- [ ] Point on empty ground returns null.

Selection (`selection.test.ts`):
- [ ] In attack mode, a click on an enemy's sprite (unit target) sends `attack` for that unit when in reach and in sight.
- [ ] The same click out of reach returns a refusal with `target-out-of-range`, and sends nothing.
- [ ] The same click without line of sight returns a refusal with `no-line-of-sight`.
- [ ] A click on an enemy portrait in the turn queue behaves as the sprite click.
- [ ] Clicking an ally sprite selects the ally, as before.

## 6. Dependencies

- EA-5 (`attackArea` for the refusal predicate).
- EA-1 (`hasLineOfSight`).
- EA-14 (`no-ammunition` and `no-mana` refusals), if merged; otherwise the refusal list omits them.

## 7. Decisions (proposed, not yet confirmed)

- **D1. Hit area:** sprite bounds plus 4 px (recommended). Alternative: an ellipse over the body, less forgiving at the edges.
- **D2. Invalid target feedback:** log line only (recommended, reuses the existing log), or a short floating label over the unit.

## 8. Out of scope

- Multi-target attacks.
- Attack preview with expected damage (the camera handoff mentions it for EA-7; not part of this ticket).
- Enemy previews (EA-6).
