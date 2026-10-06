# Plan: EA-5 · Show full movement and attack range of the selected unit

**Milestone:** lot 2 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-1 (line of sight), EA-2 (reachable cells, shared with the server)
**Created:** 2026-10-05
**Status:** ready for review

## 1. Objective

Selecting a unit of the team with the turn shows two areas: the cells it can reach this turn in one colour, and the cells it can attack from where it stands in another. An optional toggle shows the threat range: every cell it could attack after moving.

## 2. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/attack.ts` | create | `attackArea(state, from, unit): Position[]`: cells within the unit's reach of `from` with line of sight from `from` (EA-1). `threatArea(state, unitId): Position[]`: union of `attackArea` over the unit's reachable cells, plus its current cell |
| `src/attack.test.ts` | create | Section 4 |
| `src/index.ts` | modify | Export both for the client |

**`attackArea` counts cells, not enemies.** It lists every cell that would be a legal target position, occupied or not. The client decides what a click on each cell means (EA-8).

**Reach and resource.** `attackArea` uses the reach the attack would have now: `range`. Ammunition or mana at zero does not shrink the area in the engine; the client shows the area and the attack refusal reason on click (EA-14). This keeps the highlight independent of the resource state, the same way EA-2 keeps reachability independent of the path choice shown.

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/game/highlight.ts` | modify | Selection mode paints two sets: reachable (`reachableCells`) and attack area (`attackArea` from the current cell). Threat mode paints `threatArea` |
| `src/game/selection.ts` | modify | Selecting a unit sets the selected unit for highlights; no action is sent |
| `src/game/actions.ts` | modify | Threat-range toggle state |
| `src/scenes/HudScene.ts` | modify | Toggle button "Ameaça" (threat), with its state shown |
| `src/view/unit-look.ts` or the map view (file to confirm) | modify | Colours: reachable and attack area are distinct; threat uses a third, dimmer colour |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Labels for the toggle and the legend |
| Tests: `highlight.test.ts`, `selection.test.ts` | modify | Section 4 |

**Colours.** Three distinct tones: reachable (movement), attack area (current position), threat (after moving). Colour-blind safety: each set also has a different border pattern, to be chosen in review.

## 3. Contract of the layer

- **`attackArea(state, from, unit): Position[]`**: cells at distance ≤ `unit.range` from `from`, with line of sight from `from` (EA-1), inside the board. Pure. Does not depend on whose turn it is.
- **`threatArea(state, unitId): Position[]`**: pure. Uses `reachableCells` of the unit as if it had its full movement and the turn. Empty if the unit is dead.
- **Not done by this layer:** enemy previews without selection (EA-6), targeting clicks (EA-8), resource refusals (EA-14).

## 4. Tests planned

Engine (`attack.test.ts`):
- [ ] Attack area of a Sniper at range 3 on open ground: the 7×7 square minus its own cell.
- [ ] A building between the unit and a cell removes the cells behind it (EA-1 rule).
- [ ] Attack area ignores occupancy: an enemy cell and an empty cell are both included.
- [ ] Threat area is a superset of the attack area from the current cell.
- [ ] Threat area of a unit with no movement left is still computed as if it had its full movement.
- [ ] Dead unit: empty area.

Client:
- [ ] Selecting a unit paints the reachable set and the attack area in different sets.
- [ ] The threat toggle paints `threatArea` only while on.
- [ ] Selecting a unit sends no action.
- [ ] The highlight never paints a cell that `reachableCells` or `attackArea` excludes.

## 5. Dependencies

- EA-1, EA-2 merged.
- EA-6 reuses `attackArea` and `threatArea` for enemies.
- EA-8 reads the same attack area for the click target.

## 6. Decisions (proposed, not yet confirmed)

- **D1. Attack area shows every cell or only cells with a target?**
  - A. Every legal cell in reach with line of sight. Shows the real range, as the ticket asks. **Recommended.**
  - B. Only cells with an enemy. Less noise, but hides the range.
- **D2. Threat toggle location:** HUD button next to the action bar (recommended) or inside the unit panel.

## 7. Out of scope

- Enemy previews (EA-6).
- Attacks by clicking the sprite (EA-8).
- Cover and height bonuses (M3).
