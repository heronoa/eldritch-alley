# 0012. Cover and typed props on the board

**Status:** Accepted (2026-10-07).

## Context

The pitch lists cover — walls, crates, cars — among the rules the terrain carries. Until M3 the engine
knew nothing about it. The three maps described their props in data (`PropSpec[]`,
`backend/game-server/src/maps/prototype-maps.ts`), the client drew them, and `boardOf`
(`backend/game-server/src/map.ts`) dropped them when it built the board it hands the engine. To the
rules a crate did not exist: it was a hundred pixels of art and a walkable cell.

The engine's board was levels alone, and the line of sight (EA-1) read levels alone: a cell blocked
only by being tall enough. Nothing else on the board could affect a shot.

The owner decided on 2026-10-07 (B4) that cover is modelled as **typed props on the engine board**, at
cell granularity rather than on the edge between two cells, and that the maps themselves do not change
in M3.

## Decision

1. **A prop is typed data on the board.** `PropKind` is `'wall'` or `'cover'`; a `Prop` is a position
   and a kind; at most one prop stands on a cell. The board of a setup may leave `props` out, exactly
   as a unit may leave `movementProfile` out; the board of a match always carries the list, exactly as
   `UnitState` always carries a profile. `Board.props` is optional, `BoardState.props` is required.
2. **The map classifies, the server builds.** The client keeps drawing the art from its own copy of
   the map; the rules read the state. `PROP_EFFECTS` (`backend/game-server/src/map.ts`) is the table
   that turns a prop type into a kind, and the board built for the engine carries the classified list.
   A prop type that is not in the table is decoration. The table must hold exactly the vocabulary the
   three maps place: a new prop type in the map data fails a test instead of quietly becoming scenery
   the player walks through.
3. **A wall blocks the line of sight.** A `wall` prop on a cell strictly between the two ends blocks
   the line, exactly like a cell tall enough to break it. A wall on either end does not block, which is
   the limit the height rule already had. `hasLineOfSight` keeps its signature and stays symmetric.
4. **Cover lowers the chance to hit.** `coverFor(board, target, attacker)` is true when a `cover` prop
   stands on the target's cell — it is crouched behind it, from every direction — or on one of the
   eight cells around the target that lie on the attacker's side. The test is integer: with `a` the
   sign vector from the target to the attacker, a neighbour offset `d` is on that side when
   `d.x * ax + d.y * ay > 0`. For an attacker due east that is the three neighbours with `x = 1`: the
   cells the shot crosses to arrive.
   The cell the attacker itself stands on never counts. A shooter standing on a crate has the crate
   under its feet, not between the two.
5. **The penalty is data.** `COVER_HIT_PENALTY = 25` points of the 0..100 accuracy — one level of
   cover — as a constant in `backend/engine/src/cover.ts`, the shape `corpseRounds` already has, so the
   balance pass (m3-04) tunes a number and not a rule. The chance to hit is
   `max(0, attacker.hitChance - penalty)`, never below zero.
6. **The number of rng draws does not depend on cover.** The same single draw decides the shot whether
   or not cover applied, so a match recorded with cover replays identically and a unit whose accuracy
   is under the penalty can still spend its resource and its action.
7. **The shot says so.** The `attacked` event carries `cover: boolean`, true exactly when `coverFor`
   was true as the shot was resolved. The client names cover on a hit that landed through it ("apesar
   da cobertura" / "through cover"); a miss reads the same either way, because the player already knows
   the shot did not land. The word in the code is cover, the word on the screen is the fiction's, as
   ADR 0011 set for mana and energy.
8. **A wall blocks sight, never movement.** A car and a crate stay walkable cells. Making props solid
   would change the three approved maps, which M3 does not do.
9. **The props of the three maps.** The table below is the proposed classification, tuned on the board
   and to be revisited in m3-04:

   | Kind | Prop types |
   |---|---|
   | `wall` (blocks sight) | `tower` |
   | `cover` (lowers the chance to hit) | `car`, `crates`, `dumpster`, `moto`, `ac`, `vent`, `fountain`, `bench` |
   | decoration | every other type the maps place (`lamp`, `tree`, `tape`, `bush`, `puddle`, `leak`, `trash`, `traffic`, `solar`, `pole`, `manhole`, `skylight`, `hydrant`, `flyers`, `dish`, `chalk`, `bags`, `antenna`) |

## Consequences

- `hitChanceFor(state, attacker, target)` becomes the one place a hit is decided, which is where m3-02
  folds facing and height and where m3-03 reads an ability's `ignoresCover`.
- The state carries the rule, the map carries the art: the client marks a cell from
  `state.board.props`, never from its own copy of the map, so what the player sees is what the server
  applies.
- The board is immutable for the whole match: no prop is created and none is destroyed. The Wizard's
  wall and props broken by damage need their own decision.
- `PROTOCOL_VERSION` rises to 7: the state's board carries `props`, and the `attacked` event carries
  `cover`.
- The known limit of the blocking rule: a wall the line only touches at an end does not block, because
  only the strictly intermediate cells are checked. A tile the shooter or the target stands on is a
  tile it may shoot from and be shot on.
