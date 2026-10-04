# Plan — Map variety, M3: three 10×10 maps, one drawn at random per match

**Milestone:** m3-server
**Parent feature:** [map-variety.index.md](./map-variety.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Replace the single nearly-flat 8×8 board with the prototype's three 10×10 maps, and let the room draw a
random seed per match so the map varies. Everything the client needs already travels in the public state.

### 2. Prerequisites

- M2 merged (the client draws whatever board the state carries).
- **DT-32 fixed first** (section 7, step 1): its recorded trigger is "before the next change to
  `backend/game-server`", and the new map tests cannot run without it.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `backend/game-server/vitest.config.mts` | rename | The DT-32 fix: the config loads as ESM, so the suite starts |
| `backend/game-server/src/map.ts` | modify | `MAPS` with the three boards, `spawnsFor`, `mapIndex`, `createMatchSetup`; `CLASS_SPECS` and the unit builders unchanged |
| `backend/game-server/src/map.test.ts` | create | The invariants of section 5 |
| `backend/game-server/src/battle-room.ts` | modify | Draws a random seed per match (line 79) |

### 4. Contracts

#### 4.1 The port

Each map is a 10×10 `Board` whose `levels[y * 10 + x]` is the level of `(x, y)`, ported from the prototype's
tiles and heights:

- prototypes `s a z x` (sidewalk, asphalt, crosswalk, alley), `g p q` (grass, path, plaza) and the roof
  tiles → the level the port assigns below;
- prototype `w` (lake) and `v` (the gap to the street) → 0, the low ground;
- prototype `B` (building, blocked there) and `f` (fenced yard, blocked there) → **3, the wall level**,
  except on the roof map (section 4.2);
- the prototype's hill (`+1`, `+2`) and its roof heights 4–8 → 1 or 2.

**Spawn landings.** The six spawn cells of section 4.3 are **cleared to level 1** on every map, whatever they
were (a wall at 3, a hill at 2, a roof at 2). Both sides then start on the same footing. Where the prototype's
corner is a wall, the port also opens the shortest link from the landing to the map's walkable region,
because a spawn that cannot reach the map is not a spawn.

**No level 3 on the roof map.** Its prototype relief is a continuous ramp (4 to 8) cut by a chasm, so any
level-3 cell would touch a level-2 one and stop being a wall. The roof map therefore uses levels 0, 1 and 2,
and the chasm is what walls it off: every cell of the gap is 0 and every one of its neighbours is 2, so the
gap is a two-level drop everywhere and the plank is the only crossing.

#### 4.2 The three boards, after the port and the landing carve

Digits are the level; `(0,0)` is the top-left of each block, row by row.

**street** — `id: 'street'`. Ground 0, walls 3, plus the landing and the lane along the yard's south edge:

```
y0  1 1 3 3 3 3 3 3 3 3
y1  1 0 0 0 0 0 0 0 0 3
y2  3 0 0 0 0 0 0 0 0 3
y3  3 0 0 0 0 0 0 0 0 3
y4  3 0 0 0 0 0 0 0 0 3
y5  3 3 3 3 0 3 3 3 3 3
y6  3 3 3 0 0 3 3 3 3 3
y7  3 3 3 3 0 0 3 3 3 3
y8  3 3 3 3 0 3 3 3 3 1
y9  3 3 3 0 0 1 1 1 1 1
```

The alley (x=4 down from y5, with the recesses at x=3 and x=5) stays the only way between the street and the
yard, and it still serves as the single firing lane the prototype's log describes. The lane at y9 is inside
the yard and does not add a second crossing.

**park** — `id: 'park'`. Water 0, grass/path/plaza 1, the hill 2, the border buildings 3:

```
y0  1 1 3 3 3 3 3 3 3 3
y1  1 1 1 1 1 1 1 1 1 1
y2  3 1 0 0 1 1 1 1 1 1
y3  3 1 0 0 1 1 1 1 1 1
y4  3 1 1 1 1 1 1 1 1 1
y5  3 1 1 1 1 1 1 1 1 1
y6  3 1 1 1 1 1 1 1 1 1
y7  3 1 1 1 1 1 1 2 2 1
y8  3 1 1 1 1 1 1 2 2 1
y9  3 1 1 1 1 1 1 1 1 1
```

The hill's summit (`+2`) is capped at 2, and its three cells against the (9,9) corner become the landing, so
the contested high ground is the 2×2 plateau at (7,7)–(8,8). Water is walkable in and out at a cost of one
extra step to climb out: the engine has no blocked tiles, and wading is the honest reading of a pond.

**roof** — `id: 'roof'`. The gap 0, the arrival deck 1, every roof 2, no wall:

```
y0  1 1 2 2 2 2 0 2 2 2
y1  1 2 2 2 2 2 0 2 2 2
y2  2 2 2 2 2 2 0 2 2 2
y3  2 2 2 2 2 2 0 2 2 2
y4  2 2 2 2 2 2 2 2 2 2
y5  2 2 2 2 2 2 0 2 2 2
y6  2 2 2 2 2 2 0 2 2 2
y7  1 2 2 2 2 2 0 2 2 2
y8  1 1 2 2 2 2 0 2 2 2
y9  1 1 2 2 2 2 0 2 2 1
```

`(6,4)` is the plank: the gap column's only level-2 cell, so the west half of the roof and the east half
(where the prototype puts the neighbour's roof and the sniper's high point) are joined by that one cell.
The deck at the south-west corner is the low ground the squad arrives on.

#### 4.3 Spawns, by board size

`spawnsFor(board)`:

- A, the human: `(0,0)`, `(1,0)`, `(0,1)`;
- B, the bot: `(width−1, height−1)`, `(width−2, height−1)`, `(width−1, height−2)`.

On 10×10 that is (0,0) and (9,9). The order still matches `CLASS_ORDER`, so the sniper leads each squad.

#### 4.4 The pick

- `MAPS: readonly MatchMap[]` — `{ id: 'street' | 'park' | 'roof', board: Board }` in that order.
- `mapIndex(seed) = seed % MAPS.length`.
- `createMatchSetup(seed)`: `{ seed, map: MAPS[mapIndex(seed)].board, teams: rosterFor(board) }`.
- `MATCH_SEED = 1` stays as the deterministic default, which now means `park`. The existing tests that pass
  it keep working unchanged, and the integration test still rebuilds the same match from the received seed.
- `randomSeed()` in `battle-room.ts`: `randomInt(0, 2 ** 32)` from `node:crypto`. The engine still never
  draws one (ADR 0005); the room does, as content choice, and the seed it writes into the state is what
  makes the match reproducible afterwards. No protocol change: `seed` and `board` are already public.

### 5. Tests planned

**`map.test.ts`** (new), for each map in `MAPS`:

- [ ] **I1 — walls are unreachable:** no level-3 cell is orthogonally adjacent to a level-2 cell.
- [ ] **I1b — the gap is unreachable:** on every map, a level-0 cell that has any orthogonal neighbour at
      level 1 or 2 is walkable ground (water, street), and no cell that the port calls a chasm breaks the
      rule — asserted as: on `roof`, every neighbour of the gap column is level 2, and `(6,4)` is the only
      level-2 cell in that column.
- [ ] **I2 — spawns are legal:** the six spawn cells are in bounds and at level 1, and the two clusters are
      distinct.
- [ ] **I3 — no orphans:** a flood fill from `(0,0)` over steps with `|Δlevel| ≤ 1` reaches every walkable
      cell (level ≤ 2) and every other spawn.
- [ ] **I4 — the palette holds:** every level is 0..3, the board is `width × height` with
      `levels.length === width * height`, and `validateBoard` accepts it.
- [ ] The three `id`s are `street`, `park`, `roof` and no two boards are equal.
- [ ] `mapIndex` is stable for a seed and covers all three maps across `0..MAPS.length * 3`.
- [ ] `createMatchSetup(MATCH_SEED)` returns `MAPS[mapIndex(MATCH_SEED)]`'s board, and the same setup twice.
- [ ] Each map's spawns are reachable **from the other team's spawns** (implied by I3, asserted directly so a
      future map edit that isolates a cluster fails with an obvious message).

### 6. Dependencies

- M2 merged. DT-32 is fixed at the start of this milestone.
- M4 depends on this: the screenshots need the three real maps.

### 7. Execution steps

1. **DT-32.** Rename `backend/game-server/vitest.config.ts` to `vitest.config.mts` (not `"type": "module"`,
   which would change how the CJS `dist/` is emitted), then run
   `npm test -w @eldritch-alley/game-server` and confirm `battle-room`, `bot` and `integration` run. Record
   the resolution in `technical-debt.md`.
2. Write `map.test.ts` first, against the three boards described above, and watch it fail on the old `map.ts`.
3. Rewrite `map.ts`: `MATCH_SEED`, `MAPS`, `spawnsFor`, `rosterFor`, `mapIndex`, `createMatchSetup`, keeping
   `CLASS_SPECS`, `CLASS_ORDER`, `makeUnit`, `emptyEquipment` and `emptyAbilities` as they are.
4. `battle-room.ts`: `newMatch(createMatchSetup(randomSeed()))`.
5. Run `npm test -w @eldritch-alley/game-server`, `npm test -w @eldritch-alley/frontend`,
   `npm test -w @eldritch-alley/engine` (with the machine otherwise idle, DT-31) and `npx tsc --noEmit`.
6. Live check: two matches in a row must not be the same map.

### 8. Acceptance

- [ ] The game-server suite runs and is green, including the new map tests.
- [ ] The three existing test files pass with `MATCH_SEED`, unchanged.
- [ ] `backend/engine/` is untouched (`git status --porcelain -- backend/engine` is empty).
- [ ] Two live matches in a row show different maps.

### 9. Out of scope

- The prototype's props and its blocked tiles.
- Line of sight: a wall stops movement but not fire, so a sniper can shoot across a building until roadmap
  M3 lands.
- A map name in the protocol (a new public field, `PROTOCOL_VERSION` 3).
- **Known asymmetry to review:** the prototype's park puts its hill in the (9,9) corner, which is team B's
  spawn. The landing is carved to level 1, but B still starts two moves from the plateau while A crosses the
  map. Mirroring the park board left-to-right would even that out; it is not done here because it would
  change the prototype's orientation. The owner decides after playing it.
