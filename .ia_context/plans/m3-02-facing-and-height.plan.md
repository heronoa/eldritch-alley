# Plan — m3-02 · Facing, direction bonus and height advantage

**Milestone:** m3-02
**Parent feature:** m3-rules-and-content
**Created:** 2026-10-07
**Status:** pending
**ADRs:** 0013 · Facing and the direction bonus · 0014 · Height advantage (to write)

## 1. Objective

A unit has a facing, N, S, E or W. An attack from the flank or from behind it hits more often and
hurts more, and an attack from above reaches further and hits more often. `hitChance` and `range`
stop being the whole story: they become the base a shot is modified from, in the one function that
already decides a hit.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0013-facing-and-direction-bonus.md` | create | Facing, when it changes, the three directions and their bonuses |
| `docs/adr/0014-height-advantage.md` | create | The height table, and that height touches range and accuracy, never damage |
| `docs/adr/README.md` | modify | Two new rows |
| `backend/engine/src/types.ts` | modify | `Facing`; `UnitState.facing`; `Direction`; the `face` action; `attacked` gains `direction` and `stood` (the height difference) |
| `backend/engine/src/facing.ts` | create | `facingOf(from, to)` (the facing a step or a shot leaves), the direction classification, the bonus table |
| `backend/engine/src/height.ts` | create | `heightAdvantage(board, attacker, target)` and the table |
| `backend/engine/src/actions.ts` | modify | `face` accepted as a free action; `validateAttack` and `attackArea` read one `effectiveRange`; `resolveHit` folds in direction and height |
| `backend/engine/src/events.ts` | modify | `moved` and `attacked` write the actor's new facing |
| `backend/engine/src/match.ts` | modify | `newMatch` gives every unit an opening facing (decision D1) |
| `backend/engine/src/index.ts` | modify | Export `effectiveRange` and `attackDirection`, so the preview and the server answer alike |
| `backend/engine/src/forbidden.test.ts` | modify | `facing.ts` and `height.ts` join `GUARDED_MODULES` |
| `backend/engine/src/facing.test.ts`, `height.test.ts` | create | Section 4 |
| `backend/engine/src/actions.test.ts`, `movement.test.ts`, `properties.test.ts`, `hash.test.ts` | modify | Section 4 |
| `backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts` | modify | Version 8: `unit.facing`, the `face` action, `attacked.direction` |
| `backend/game-server/src/action-shape.ts` | modify | The `face` action as the client may send it |
| `frontend/src/view/facing.ts` | create | The arrow's angle for a facing, given the view's rotation |
| `frontend/src/scenes/units.ts` | modify | The V arrow on the unit, and the sprite mirrored for E and W only |
| `frontend/src/scenes/MatchScene.ts` | modify | The facing control, reachable while the auto end turn is cancelled |
| `frontend/src/game/log.ts`, `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The attack sentence names the flank, the rear and the height |

## 3. Contract of the layer

**Facing.** `type Facing = 'N' | 'S' | 'E' | 'W'`. Every unit in a match carries one. It changes
when the unit moves or shoots (the dominant direction of the last step, or the direction to the
target), and when the player sets it.

**The `face` action.** `{ type: 'face'; actor: UnitId; facing: Facing }`. It spends no movement and
no action, and it does not end the turn: a unit that has spent everything can still turn before it
passes. Refused with `not-your-turn` for another unit and `game-over` in a finished match. Nothing
else refuses it.

**Which facing a step leaves.** `facingOf(from, to)` reads the sign of `to - from`: the larger
absolute component wins, and a tie goes to the horizontal, the order ADR 0010 already fixed for the
walk.

**The direction of an attack.** `attackDirection(target, attacker)` classifies the attacker among
the eight cells around the target against the target's facing: `front` when the dot product of the
two direction vectors is positive, `rear` when it is negative, `flank` when it is zero. Pure and
integer.

**The bonus.** One table in `backend/engine/src/facing.ts`, tuned in m3-04:

| Direction | Hit | Damage |
|---|---|---|
| front | 0 | +0 |
| flank | +10 | +1 |
| rear | +15 | +2 |

**Height advantage.** `heightAdvantage(board, attacker, target)` reads `levelAt(attacker) -
levelAt(target)` and one table in `backend/engine/src/height.ts`:

| Levels above | Hit | Range |
|---|---|---|
| two or more | +10 | +1 |
| one | +5 | 0 |
| same | 0 | 0 |
| one below | −5 | 0 |
| two or more below | −10 | −1 |

**Range.** `effectiveRange(state, attacker, target)` is `max(1, attacker.range + heightRange)`. The
refusal (`validateAttack`) and the painted area (`attackArea`, which the client imports) both call
it, so the preview can never offer a cell the server refuses (EA-1 D1).

**What this layer does not do.** Facing never reduces a defence by itself (only the direction bonus
reads it), the sprite keeps its front view (DT-58), and nothing here changes movement, resources or
line of sight.

## 4. Tests planned

**Engine — facing (`facing.test.ts`)**
- [ ] After a step in each of the eight directions, the facing is the dominant axis.
- [ ] A diagonal step breaks the tie to the horizontal, deterministically.
- [ ] After an attack, the attacker faces the target.
- [ ] The eight cells around a target classify as front, flank or rear for each of the four facings
      (one table, asserted whole).
- [ ] `attackDirection` does not read the attacker's own facing.

**Engine — height (`height.test.ts`)**
- [ ] Every difference from −3 to +3 gives the hit and range of the table.
- [ ] `effectiveRange` never goes below 1.
- [ ] A unit on a rooftop at the table's top and a unit in the alley at the bottom disagree by the
      table's two ends.

**Engine — actions (`actions.test.ts`)**
- [ ] `face` changes the facing, leaves `movementLeft` and `hasActed` untouched, and does not end the
      turn.
- [ ] `face` is refused with `not-your-turn` for a unit that is not on turn.
- [ ] An attack from the rear of a target hits on a roll the front attack misses, same seed.
- [ ] Damage from the rear is the attack plus the table's bonus; from the front it is the attack.
- [ ] An attack from two levels above reaches a cell that is out of range from the same level, and
      `attackArea` covers exactly the cells `validateAttack` accepts, at every height difference.
- [ ] Height never changes the damage.
- [ ] The `attacked` event carries the direction and the height difference it used.
- [ ] Hash: the same seed and the same actions give the same final state, facings included.

**Engine — setup and replay (`match.test.ts`, `properties.test.ts`)**
- [ ] The opening facing of every unit is the same for the same seed (decision D1).
- [ ] A replay rebuilds the facings from the events alone: the `moved` and `attacked` events are
      enough, and the explicit `face` action stores its own event.

**Client**
- [ ] The arrow's angle follows the map's rotation: the same facing points at the same cell from all
      four views.
- [ ] The sprite mirrors for E and W only, and never for N or S.
- [ ] The log sentences for flank, rear and height exist in both catalogs.

## 5. Dependencies

- m3-02 touches `resolveHit` in `backend/engine/src/actions.ts`, the same function m3-01 changes.
  Land m3-01 first; do not run the two in parallel branches.
- ADRs 0013 and 0014 written and accepted before the code, as the project does for every rule.
- The values in both tables are provisional: m3-04 tunes them, and the tests are written against the
  tables rather than against the numbers.

## 6. Out of scope

- The back view of a sprite (DT-58). The facing is drawn as an arrow, and the sprite only mirrors,
  which is what the owner asked for on 2026-10-07.
- Facing spent as a resource, or a class that turns for free while others pay for it.
- Reactions (ADR 0007): a rear attack does not open a window in this milestone.
- Cover. It is m3-01, and it folds into the same function.

## 7. Decisions

**D1 · The opening facing.** A unit starts facing its own side of the map (from a spawn on the left
edge, E). **Recommended**: it is the direction the unit will most likely act in, and it is a pure
function of the spawn, so it stays reproducible from the seed. Alternative: every unit starts facing
S, which is simpler but arbitrary, or the spawns' data names a facing each.

**D2 · Diagonal attackers.** With the dot product, the four diagonal cells read as front or rear
according to which way they lean, so a shot from the front-left is a front shot. **Recommended**:
it matches what a player expects from a unit looking north. Alternative: every diagonal is a flank,
which makes flanking easier to reach but reads oddly for a shot that is almost head-on.

**D3 · The facing control.** The player cancels the automatic end of turn with a click (already the
behaviour, `frontend/src/scenes/MatchScene.ts:455`) and then picks N, S, E or W from a control in the
dashboard. **Recommended**: no new gesture on the board, and the arrow keeps showing the facing at
all times, as the owner described. Alternative: clicking the edge of the unit's own cell sets the
facing, which is faster but collides with selecting and moving.

**D4 · Naming.** The engine's word is `facing`; the client's is "direção" in pt-BR and "facing" in
en-US. The three directions are `front`, `flank` and `rear` in the engine, and the screen says
"de frente", "de flanco" and "pelas costas".
