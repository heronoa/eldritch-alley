# Plan — m3-01 · Cover

**Milestone:** m3-01
**Parent feature:** m3-rules-and-content
**Created:** 2026-10-07
**Status:** pending
**ADR:** 0012 · Cover and typed props on the board (to write)

## 1. Objective

The board carries the map's props as rules data, and a prop changes a shot: a **wall** blocks the
line of sight, a **cover** prop lowers the chance to hit whoever stands behind it. The client stops
being the only place that knows a crate is a crate. Next milestone, m3-02, folds its modifiers into
the same function; m3-03 reads `ignoresCover` from an ability.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0012-cover-and-typed-props.md` | create | The prop kinds, the blocking rule, the cover rule, the penalty as data |
| `docs/adr/README.md` | modify | The new row, plus the missing 0010 and 0011 rows |
| `backend/engine/src/types.ts` | modify | `PropKind`, `Prop`; `Board.props` optional in a setup; `BoardState` with `props` required; `attacked` gains `cover: boolean` |
| `backend/engine/src/board.ts` | modify | `propsOf(board)` (the board's props, or empty), `propAt(board, position, kind)` |
| `backend/engine/src/sight.ts` | modify | A `wall` prop on a cell between the two ends blocks the line, exactly like a tall cell |
| `backend/engine/src/cover.ts` | create | `coverFor(board, target, attacker)` and `COVER_HIT_PENALTY` |
| `backend/engine/src/actions.ts` | modify | `resolveHit` reads the board: cover lowers `hitChance`; the `attacked` event carries `cover` |
| `backend/engine/src/match.ts` | modify | `validateSetup` validates props (in bounds, no duplicates); `newMatch` normalises `board.props` to `[]` |
| `backend/engine/src/index.ts` | modify | Export `propsOf` and `coverFor`, so the client can mark the covered cells |
| `backend/engine/src/forbidden.test.ts` | modify | `cover.ts` joins `GUARDED_MODULES` |
| `backend/engine/src/cover.test.ts` | create | Section 4 |
| `backend/engine/src/sight.test.ts`, `actions.test.ts`, `properties.test.ts`, `match.test.ts` | modify | Section 4 |
| `backend/game-server/src/map.ts` | modify | `PROP_EFFECTS` (prop type → kind), and `boardOf` builds the board's props from the map's own |
| `backend/game-server/src/maps/prototype-maps.test.ts`, `backend/game-server/src/map.test.ts` | modify | Every prop type is classified; the board's props match the map's |
| `backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts` | modify | Version 7: `board.props`, `attacked.cover` |
| `frontend/src/scenes/map/MapView.ts` | modify | Mark the cells the state calls cover or wall, so what the player sees is what the server applies |
| `frontend/src/game/log.ts`, `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The attack sentence says when cover applied |

## 3. Contract of the layer

**Board (engine).** The setup may leave `props` out, the way it may leave `movementProfile` out; a
board inside a match always carries one, the way `UnitState` always carries a profile.

```ts
export type PropKind = 'wall' | 'cover';
export interface Prop { position: Position; kind: PropKind }
export interface Board { width: number; height: number; levels: readonly number[]; props?: readonly Prop[] }
export interface BoardState extends Board { props: readonly Prop[] }
```

**Line of sight.** `hasLineOfSight(board, from, to)` keeps its signature and stays symmetric: a
`wall` prop on a cell strictly between the two ends blocks the line. A wall on either end does not
block, which is the rule the height test already follows.

**Cover.** `coverFor(board, target, attacker)` is true when a `cover` prop stands on the target's
cell, or on one of the eight cells around it lying on the attacker's side (the integer test is
`d.x * ax + d.y * ay > 0` for the neighbour offset `d` and the sign vector from the target to the
attacker). Pure, integer, no state.

**Hit chance.** `hitChanceFor(state, attacker, target)` is `max(0, attacker.hitChance - penalty)`
with `COVER_HIT_PENALTY` (proposed 25 points) applied only when `coverFor` is true. `resolveHit`
takes the state, so the single place a hit is decided keeps being the single place.

**What this layer does not do.** It does not block movement (a wall is not a wall for walking), it
does not let props change during a match, and it does not send the prop art to the client: the
client keeps drawing the art from its own copy of the map and reads the rule from the state.

## 4. Tests planned

**Engine — sight (`sight.test.ts`)**
- [ ] A wall between two cells blocks the line in both directions.
- [ ] A wall on the attacker's cell and on the target's cell does not block (documented limit).
- [ ] A wall off the line does not block.
- [ ] A board with no props behaves exactly as before (the whole existing suite is the regression).

**Engine — cover (`cover.test.ts`)**
- [ ] A cover prop on the target's cell gives cover.
- [ ] A cover prop on the attacker's side of the target gives cover, for all eight attacker directions.
- [ ] The same prop on the opposite side gives no cover.
- [ ] A wall prop never gives cover, and a cover prop never blocks sight.
- [ ] `coverFor` is symmetric in the sense the rule states: it depends on the attacker's side only.
- [ ] `coverFor` outside the board throws, like `levelAt`.

**Engine — hit (`actions.test.ts`)**
- [ ] With cover, a roll that hits without cover misses with it (same seed).
- [ ] The hit chance never goes below 0, and a unit whose accuracy is under the penalty can still
      spend its resource and its action.
- [ ] The `attacked` event carries `cover: true` exactly when `coverFor` is true.
- [ ] The number of rng draws is the same with and without cover, so a replay of either matches.
- [ ] Hash: the same seed and the same actions give the same final state with props on the board.

**Engine — setup (`match.test.ts`, `properties.test.ts`)**
- [ ] A setup with no `props` plays, and the match state carries an empty list.
- [ ] A prop outside the board, or two props on the same cell, throws.
- [ ] A `wall` on a cell a unit stands on is accepted (the limit in section 3).

**Server (`map.test.ts`, `prototype-maps.test.ts`)**
- [ ] Every prop type in the three maps is in `PROP_EFFECTS`. A new prop type in the map data fails
      this test rather than silently becoming decoration.
- [ ] The board's props are exactly the map's props of a classified type, at the same positions.
- [ ] The three approved maps still play: the same seed gives the same opening and the same reachable
      cells as before this change (a regression on the boards themselves).

**Client**
- [ ] The cover and wall marks are read from `state.board.props`, not from the local map copy.
- [ ] The log sentence for an attack with cover exists in both catalogs (`catalog.test.ts`).

## 5. Dependencies

- None. m3-01 is the first milestone.
- The owner approved M2 on 2026-10-07, so the pending M2-b reconnection test does not block this
  plan; it is carried as an acceptance item of m3-05, the milestone played on a published build.
- A decision is needed before the ADR is written (section 7).

## 6. Out of scope

- Blocking movement: a car and a crate stay walkable cells, exactly as they are today. Making props
  solid changes the three approved maps, and that is not this milestone's subject.
- Props created during a match (the Wizard's Wall) and props destroyed by damage. The board is
  immutable in the engine, so a created prop needs its own decision.
- Cover from an edge between two cells (the XCOM model). The owner chose cell granularity on
  2026-10-07.
- The client drawing prop art from the state. Today it draws from its own checksum-synced copy; the
  state carries the rule, not the art.
- Any change to the three approved maps. M3 delivers no map.

## 7. Decisions

**D1 · Which props are cover and which are walls?** The three maps carry 27 prop types. Proposed
table, to be tuned in m3-04:

| Kind | Prop types |
|---|---|
| `wall` (blocks sight) | `tower` |
| `cover` (lowers the chance to hit) | `car`, `crates`, `dumpster`, `moto`, `ac`, `vent`, `fountain`, `bench` |
| — (decoration) | everything else (`lamp`, `tree`, `tape`, `bush`, `puddle`, `leak`, `trash`, `traffic`, `solar`, `pole`, `manhole`, `skylight`, `hydrant`, `flyers`, `dish`, `chalk`, `bags`, `antenna`) |

- **A.** The table above. **Recommended**: one real blocker and a clear set of chest-high objects.
- **B.** A shorter set (`car`, `crates` only), so cover stays rare and the maps change less.
- **C.** The owner's own list, prop type by prop type.

**D2 · The penalty.** Proposed `COVER_HIT_PENALTY = 25` points of the 0..100 accuracy, one level of
cover. It is a constant in `backend/engine/src/cover.ts`, the shape `corpseRounds` already has, so
m3-04 tunes a number and not a rule. Alternative: two levels of cover (partial and full), which is
more to explain on screen and more to balance.

**D3 · Naming.** The engine's word for the effect is `cover`; the client's word is "cobertura" in
pt-BR and "cover" in en-US. The screen's vocabulary stays the fiction's, the code's stays the
mechanism's, as ADR 0011 already set for mana and energy.
