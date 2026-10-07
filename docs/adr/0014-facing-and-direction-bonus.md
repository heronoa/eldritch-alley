# 0014. Facing and the direction bonus

**Status:** Accepted (2026-10-07).

## Context

The pitch says a squad that takes a position apart pays for it: a shot from the flank or from behind is
worth more than one taken head-on. Until now a unit had no facing at all. `Unit`
(`backend/engine/src/types.ts`) carries a position, a speed, a health, an attack, a hit chance, a range
and a magazine, and none of them says which way the figure is looking.

What decides a shot today is the shooter's own accuracy, and the cover between the two ends (ADR 0012,
ADR 0013). Where the shot comes from, relative to the target, decides nothing.
`hitChanceFor` (`backend/engine/src/actions.ts`) is the single expression of a hit chance and
`resolveHit` the single place a hit is decided, which is where this rule folds in.

## Decision

1. **A unit faces one of four directions.** `type Facing = 'N' | 'S' | 'E' | 'W'`, in the board's own
   frame, the one ADR 0012 §4 reads cover in: north is towards row 0, east is towards +x. Every unit in
   a match carries a `facing`; a setup does not name one, and the match fills it.

2. **The facing changes three ways.** A unit turns to the dominant direction of the last step it took; it
   turns towards the target of a shot it makes; and the player may set it explicitly with the `face`
   action. A diagonal step breaks the tie to the horizontal, which is the order ADR 0010 already fixed
   for the walk (`facingOf(from, to)`, `backend/engine/src/facing.ts`).

3. **`face` is free.** `{ type: 'face'; actor: UnitId; facing: Facing }` spends no movement and no
   action, and it does not end the turn: a unit that has spent everything it had can still turn before
   it passes. It is refused with `not-your-turn` for a unit that is not on turn and with `game-over` in
   a finished match, and by nothing else.

4. **The direction of an attack is read off the target.** `attackDirection(target, attacker)`
   classifies the cell the attacker stands on among the eight around the target, against the target's
   facing: with `f` the unit vector of the facing and `d` the sign vector from the target to the
   attacker, the direction is `front` when `f.x * d.x + f.y * d.y > 0`, `rear` when it is `< 0`, and
   `flank` when it is `0`. Pure and integer (ADR 0005).

5. **A diagonal reads by the way it leans.** A shot from the front-left is a front shot, not a flank
   one, because the dot product is positive. This is what a player expects from a figure looking north,
   and it keeps the eight cells around a target split as three front, two flank and three rear — the
   same split the straight directions have.

6. **The attacker's own facing never enters the classification.** Flanking is about where the shot comes
   from, not about where the shooter is looking. A unit may be flanked by another that is itself
   flanked, and neither fact changes the other.

7. **The bonus is one table, tuned in m3-04.** `backend/engine/src/facing.ts`:

   | Direction | Hit chance | Damage |
   |---|---|---|
   | `front` | +0 | +0 |
   | `flank` | +10 | +1 |
   | `rear` | +15 | +2 |

   The hit bonus joins the shooter's accuracy in `hitChanceFor`, clamped to 0..100. The damage bonus is
   added to the damage of the hit, and applies only to a hit that landed.

8. **The event carries the direction.** `attacked` gains `direction`, the classification the roll used.
   The screen names it — "de frente", "de flanco", "pelas costas" — and a replay reads it instead of
   re-deriving it from positions it would have to reconstruct (ADR 0009, and the split ADR 0011 set
   between the mechanism's word and the fiction's).

9. **Every unit has a facing from the first state.** `newMatch` gives each unit the facing of its own
   side of the map: a unit spawned on the left edge starts facing east, which is the direction it will
   most likely act in. It is a pure function of the spawn, so it is reproducible from the seed and
   nothing about it travels in the setup.

10. **`PROTOCOL_VERSION` rises to 8:** the unit carries `facing`, the client may send `face`, and the
    `attacked` event carries `direction`.

## Consequences

- A player who walks a unit past an enemy pays for it: the enemy's next shot at that unit is a flank or
  a rear shot, and the unit's own turn is the one that set the facing up.
- Turning is free, so the cost of a bad facing is one action of the enemy's, not one of the player's.
  This is what makes the arrow worth drawing at all times.
- `resolveHit` and `hitChanceFor` stay the single place a shot is decided; cover (ADR 0012, ADR 0013),
  direction (this record) and height (ADR 0015) all meet there and nowhere else.
- The `attacked` event grows, so the client's log gains sentences for the flank and the rear, in both
  catalogs (ADR 0009).
- The facing is stored, not derived: a replay that applies the `moved`, `attacked` and `face` events
  rebuilds it exactly, and no rule has to guess it from the path.
- What this record does not decide: facing as a resource, a class that turns for free while another
  pays, and any reaction to being flanked (ADR 0007, a different mechanism).
