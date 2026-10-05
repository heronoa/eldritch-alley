# Plan — Map variety, M3: three 10×10 maps, one drawn at random per match

**Milestone:** m3-server
**Parent feature:** [map-variety.index.md](./map-variety.index.md)
**Created on:** 2026-10-04
**Status:** concluído em 2026-10-04

---

### 1. Objective

Replace the single nearly-flat 8×8 board with the prototype's three 10×10 maps, and let the room draw a
random seed per match so the map varies. Everything the client needs already travels in the public state.

### 2. Prerequisites

- M2 merged (the client draws whatever board the state carries).
- The suite runs: `backend/game-server/vitest.config.mts` exists, so DT-32 is already closed and the new map
  tests can be run. Only confirmation is needed (section 7, step 1).

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
y8  1 1 2 2 2 2 0 2 2 1
y9  1 1 2 2 2 2 0 2 1 1
```

`(6,4)` is the plank: the gap column's only level-2 cell, so the west half of the roof and the east half
(where the prototype puts the neighbour's roof and the sniper's high point) are joined by that one cell.
The deck at the north-west corner is the low ground team A arrives on, and the two cells the carve opened
at the (9,9) corner — `(8,9)` and `(9,8)`, both 1 — are the landing team B arrives on.

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

> **Neighbours mean the eight of Chebyshev distance 1, diagonals included** (DT-48): the engine accepts a
> diagonal step (`distance` is Chebyshev, `actions.ts:96`), so a level-2 cell diagonal to a level-3 wall is
> a way onto the wall, and a flood fill that only walks orthogonally reports a map as split when the engine
> says it is joined. Every invariant below is written on that neighbourhood.

- [x] **I1 — walls are unreachable:** no level-3 cell has a level-2 cell among its eight neighbours.
- [x] **I1b — the gap is unreachable:** on `roof`, the gap is the column `x = 6` at level 0 and `(6,4)` is
      the column's only level-2 cell; every neighbour of a gap cell **that is not itself in the column** is
      level 2, so the gap is a two-level drop from every side it can be entered from, and the plank is the
      only crossing.
- [x] **I2 — spawns are legal:** the six spawn cells are in bounds and at level 1, the two clusters are
      distinct, and no spawn sits on a cut-off cell.
- [x] **I3 — no orphans:** a flood fill from `(0,0)` over the eight neighbours, stepping only where
      `|Δlevel| ≤ 1`, reaches every walkable cell (level ≤ 2) **except the cells the map cuts off on
      purpose** — the roof's nine gap cells — and every other spawn. A chasm cannot be a wall (a wall is
      level 3 and has to stay out of reach of level 2), so the gap is level 0 ringed by level 2: nothing can
      step into it, which is exactly what the test asserts by declaring it.
- [x] **I4 — the palette holds:** every level is 0..3, the board is `width × height` with
      `levels.length === width * height`, and `validateBoard` accepts it.
- [x] The three `id`s are `street`, `park`, `roof` and no two boards are equal.
- [x] `mapIndex` is stable for a seed and covers all three maps across `0..MAPS.length * 3`.
- [x] `createMatchSetup(MATCH_SEED)` returns `MAPS[mapIndex(MATCH_SEED)]`'s board, and the same setup twice.
- [x] Each map's spawns are reachable **from the other team's spawns** (implied by I3, asserted directly so a
      future map edit that isolates a cluster fails with an obvious message).

All nine are in `map.test.ts`, which is 27 cases once `describe.each` expands the per-map block.

### 6. Dependencies

- M2 merged. DT-32 is fixed at the start of this milestone.
- M4 depends on this: the screenshots need the three real maps.

### 7. Execution steps

1. **DT-32.** Rename `backend/game-server/vitest.config.ts` to `vitest.config.mts` (not `"type": "module"`,
   which would change how the CJS `dist/` is emitted), then run
   `npm test -w @eldritch-alley/game-server` and confirm `battle-room`, `bot` and `integration` run. Record
   the resolution in `technical-debt.md`.
2. Write `map.test.ts` first, against the three boards described above, and watch it fail on the old `map.ts`.
   The invariants walk the **eight** neighbours of a cell (DT-48): a version that walks only N/E/S/W passes
   both loops, so it is written with an explicit `for (dy of [-1, 0, 1])` nest and the diagonal cells are
   asserted to be reached by the flood fill.
3. Rewrite `map.ts`: `MATCH_SEED`, `MAPS`, `spawnsFor`, `rosterFor`, `mapIndex`, `createMatchSetup`, keeping
   `CLASS_SPECS`, `CLASS_ORDER`, `makeUnit`, `emptyEquipment` and `emptyAbilities` as they are.
4. `battle-room.ts`: `newMatch(createMatchSetup(randomSeed()))`.
5. Run `npm test -w @eldritch-alley/game-server`, `npm test -w @eldritch-alley/frontend`,
   `npm test -w @eldritch-alley/engine` (with the machine otherwise idle, DT-31) and `npx tsc --noEmit`.
6. Live check: two matches in a row must not be the same map.

### 8. Acceptance

- [x] The game-server suite runs and is green, including the new map tests. 45/45 on Node 22, in five files.
- [x] The three existing test files pass with `MATCH_SEED`, unchanged. `battle-room` and `bot` do; the
      integration test had to follow the seed the room now draws (section 10).
- [x] `backend/engine/` is untouched (`git status --porcelain -- backend/engine` is empty).
- [x] Two live matches in a row show different maps. Eight rooms booted through `@colyseus/testing` drew
      `roof park street park park roof park park`, every one of them a 10×10 board.

### 9. Out of scope

- The prototype's props and its blocked tiles.
- Line of sight: a wall stops movement but not fire, so a sniper can shoot across a building until roadmap
  M3 lands.
- A map name in the protocol (a new public field, `PROTOCOL_VERSION` 3).
- **Known asymmetry to review:** the prototype's park puts its hill in the (9,9) corner, which is team B's
  spawn. The landing is carved to level 1, but B still starts two moves from the plateau while A crosses the
  map. Mirroring the park board left-to-right would even that out; it is not done here because it would
  change the prototype's orientation. The owner decides after playing it.

---

### 10. Divergences in the execution (2026-10-04)

- **DT-32 cost nothing.** The rename to `vitest.config.mts` and `.nvmrc` = 22 had already landed before this
  milestone (commit `dade2aa`), so step 1 of section 7 was a confirmation only. The caveat that remains: the
  shell's default Node is 18 and the game-server suite needs 22, so it runs with
  `PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"`.
- **`integration.test.ts` is not in section 3 and had to change.** The room now draws its own seed, so the
  `setup` the test built up front from `MATCH_SEED` stopped matching the real match. It now takes the seed
  from the first state that arrives (`setup ??= createMatchSetup(message.state.seed)`) and rebuilds through a
  `replay()` helper. Section 8's criterion, "the three existing test files pass with `MATCH_SEED`, unchanged",
  therefore does not hold as written: `battle-room.test.ts` and `bot.test.ts` build their own setup and are
  untouched, and `MATCH_SEED` stays the deterministic default of `createMatchSetup` — only the test that
  relied on the room using it had to follow the seed.
- **A defect in my own Fase 1 test.** I1 was written as "every neighbour of a wall is below 2", which forbids
  a wall touching a wall — and a building mass is exactly that. The test now reads from the raised ground,
  where the hazard is: no level-2 cell has a level-3 neighbour, which is the plan's own wording.
- **`spawnsFor` derives B by mirroring A** (Fase 3 refactor): the B list in section 4.3 is exactly A's
  mirrored through the board's centre, so the code says that instead of repeating the three cells.
- **`randomSeed()` gained the `SEED_RANGE` constant.** The draw is uniform over 0..2³²−1 and `mapIndex` takes
  it modulo 3, so index 0 gets two seeds more than the other two — a 2⁻³² bias, which does not pay for a
  rejection loop.
- **Two plan defects were corrected before the implementation** (sections 4.2 and 5): B's landing on the
  `roof` map, which the published grid left at level 2, and the wording of I1b/I3, which treated the gap's
  column as if it were not the gap itself.
- **The RED run failed at collection, not case by case.** `describe.each(MAPS)` throws while the file is
  being collected (`MAPS` does not exist yet), so the 27 cases never ran individually and I cannot show each
  one failing on the old `map.ts`. The failure is the missing implementation and not a syntax or config
  error, which is what the phase asks for, but it is a weaker RED than the plan's step 2 describes.
  `MAPS`, `spawnsFor` and `mapIndex` are named at the top of the file, so any test that mentions them at all
  goes red before the implementation exists; keeping `MAPS` out of the module scope would have failed case by
  case at the cost of a less readable test.
