# 0015. Height advantage

**Status:** Accepted (2026-10-07).

## Context

The map has height, and it has had it since the beginning: `levelAt` (`backend/engine/src/board.ts`)
answers the level of a cell, movement pays to climb it and `hasLineOfSight` (EA-1) reads it to decide
what a unit can see over and what it cannot. The rooftops, the fire escapes and the overpasses of the
pitch are drawn from that relief.

A shot reads none of it. `hitChanceFor` is the shooter's accuracy minus cover, and `attackArea` is the
shooter's `range` counted out from where it stands, flat — so a sniper on a rooftop shoots exactly as
far and exactly as well as the same sniper in the alley, which is the opposite of what the map is for.

## Decision

1. **`heightAdvantage(board, attacker, target)` reads one difference.** `levelAt(attacker) -
   levelAt(target)`, and one table in `backend/engine/src/height.ts`. Both ends are read as board
   levels, exactly as the movement rule reads them.

2. **The table, tuned in m3-04:**

   | Levels above the target | Hit chance | Reach |
   |---|---|---|
   | two or more | +10 | +1 |
   | one | +5 | 0 |
   | same | 0 | 0 |
   | one below | −5 | 0 |
   | two or more below | −10 | −1 |

   The table is symmetric in sign: a unit shooting up suffers what the one shooting down enjoys.

3. **Height touches reach and accuracy, never damage.** Shooting from above makes a shot likelier and
   lets it carry further; what it does when it lands is the weapon's business. This keeps the one
   damage modifier of the game in the direction table (ADR 0014) and out of the terrain.

4. **The reach is `effectiveRange(state, attacker, target)` = `max(1, attacker.range + reachBonus)`.**
   The floor of 1 is what stops a unit shooting up from a rooftop from losing the ability to shoot at
   all: the reach can be shortened, never taken away.

5. **The refusal and the painted area call the same function.** `validateAttack`
   (`backend/engine/src/actions.ts`) refuses a target beyond `effectiveRange`, and `attackArea`
   (`backend/engine/src/attack.ts`) paints the cells inside it, so the client can never offer a cell the
   server will refuse (EA-1, D1). Since the reach depends on the level of the cell being aimed at, the
   area is evaluated per cell and not once for the unit.

6. **The event carries the difference.** `attacked` gains `stood`, the height difference the roll used.
   The screen names it, and a replay reads it rather than re-deriving it from a board that the events
   may have moved units across.

7. **The hit bonus joins the others in `hitChanceFor`, clamped to 0..100.** Accuracy, cover (ADR 0012,
   ADR 0013), direction (ADR 0014) and height all meet in that one expression, and `resolveHit` stays
   the single place a hit is decided — one roll whatever the modifiers, so a replay draws the same
   numbers.

8. **`PROTOCOL_VERSION` rises to 8**, together with ADR 0014: the two rules land in the same change and
   the same wire format. The `attacked` event carries `direction` and `stood`.

## Consequences

- The relief of the three maps becomes a rule and not only a drawing: the contested high points the maps
  were built around now pay a shooter for holding them, which is what the roadmap asked for.
- The reach becomes a property of the pair and not of the unit, so anything that asks "how far can this
  unit shoot" has to say at what. The preview in the client evaluates it per cell, which is the same
  answer the server gives, one cell at a time.
- A unit that climbs before it shoots has spent movement for accuracy and reach, and a unit that stays
  low has spent nothing and shoots worse. That trade is the point of the rule.
- The `attacked` event grows again, so the log gains a sentence in both catalogs (ADR 0009), and the
  client's own preview and the server's refusal read the same table.
- What this record does not decide: falling damage, a shooting bonus that grows with the exact number of
  levels rather than the five rows above, and any rule that makes high ground block movement.
