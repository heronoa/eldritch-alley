# Plan — Map fidelity, M1: the prototype's map data, the map id on the wire, reachable spawns

**Milestone:** m1-data
**Parent feature:** [map-fidelity.index.md](./map-fidelity.index.md)
**Created on:** 2026-10-04
**Status:** concluído (aplicado junto com o M2, sem os quais o cliente não desenha o relevo)

---

### 1. Objective

Put the three prototype maps into data, exactly as the prototype draws them: each cell's tile letter, its
final height, the void cells, the props, the lift and the sky of each map. The server builds the engine's
board from this data and sends the map id in every state message; the client holds the same data as a copy.
The spawns are the prototype's own demo positions, checked for reachability.

### 2. Prerequisites

- None. This milestone changes no drawing.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `backend/game-server/src/maps/prototype-maps.ts` | create | The three maps as data (section 4.1), with the checksums of section 4.2 |
| `backend/game-server/src/maps/prototype-maps.test.ts` | create | Checksums, shape, props counts, the copies agree (section 5) |
| `backend/game-server/src/map.ts` | modify | `MAPS` built from `prototype-maps.ts`; `boardOf` maps void to level 0; `spawnsFor` reads the spawns of the map; `mapIndex` and `createMatchSetup` keep their shape |
| `backend/game-server/src/map.test.ts` | modify | Reachability with the 8-neighbour rule (section 5); the old 10×10 invariants that the new heights break are replaced, with the reason in the test |
| `backend/game-server/src/protocol.ts` | modify | `PROTOCOL_VERSION = 3`; `StateMessage` gains `mapId: string` |
| `backend/game-server/src/battle-room.ts` | modify | `stateMessage()` sends the id of the match's map |
| `frontend/src/maps/prototype-maps.ts` | create | Copy of the backend data (same content) |
| `frontend/src/maps/prototype-maps.test.ts` | create | The copy agrees with the same checksums |
| `frontend/src/protocol.ts` | modify | `PROTOCOL_VERSION = 3`; `StateMessage` gains `mapId` |
| `frontend/src/net/session.ts` | modify | Keeps the last `mapId` next to the last state, the same way it keeps the state |

Not touched: the engine (`backend/engine/`), the drawing, the HUD.

### 4. Contracts

#### 4.1 The data

```ts
export interface PrototypeMap {
  id: 'street' | 'park' | 'roof';
  title: string;                 // as in the prototype, for the lobby later; not drawn in this milestone
  tiles: readonly string[];      // 10 rows of 10 letters, as in data.js
  heights: readonly (readonly number[])[]; // 10×10, final heights, void as VOID
  void: number;                  // the value that marks a gap (-10 in the prototype)
  lift: number;                  // prototype `lift`, 0 when absent
  sky: 'street' | 'park' | 'roof';
  props: readonly PropSpec[];    // the prototype's props, verbatim
  spawns: { A: readonly Cell[]; B: readonly Cell[] }; // the prototype's `units` positions for ally and enemy
}
export const PROTOTYPE_MAPS: readonly PrototypeMap[] = [street, park, roof]; // in this order
```

Heights are **computed once** from the prototype's own rules, then written as a literal table. The rules, as
`js/app.js` `load()` applies them:

1. `hmap` present (`roof`): `h = hmap[y][x]`.
2. else `h()` present (`street`): `h = M.h(x, y, tile)`.
3. else a tile of `B` (`park`): `h = heights.B[(x*3 + y*7) % heights.B.length]`.
4. else a tile listed in `heights` (`park`): `h = heights[tile]`.
5. then `hill` adds `d` to the cell: `h += d` for each `[x, y, d]`.

The `roof` gap is `-10`; it stays `-10` in the table, and `void` is set to `-10` for that map. The other maps have
no void value (`void: NaN`, meaning none).

The generator is a Node script kept **outside** the repository, in the session's scratch directory. It loads
`data.js` with a stub `window`, applies the five rules above, and prints the table. The committed file is the
output; the script is not part of the repository.

#### 4.2 Checksums (the test compares these; they are recorded by the generator)

| Map | Sum of heights (void excluded) | Void cells | Cells per tile letter |
|---|---|---|---|
| `street` | recorded by the generator | recorded | recorded |
| `park` | recorded by the generator | recorded | recorded |
| `roof` | recorded by the generator | 9 (the gap column, every row except row 4, where the plank at height 6 is) | recorded |

The generator writes the three numbers for each map into the test file as constants. The test recomputes them from
the table and compares.

#### 4.3 The engine's board

- `boardOf(map)`: `levels[y*10 + x] = height`, except void cells, which become `0`.
- Void cells are impassable without a rule change: a void cell is level 0, so every ground cell next to it (heights
  5 and up on `roof`) is refused by the step rule. Void cells can touch each other, but no ground cell is reached
  through them (checked in §5). A void cell that breaks this is a failure of the test, not a silent case.
- `validateBoard` already accepts levels 0 to 255, so the engine is unchanged.

#### 4.4 Spawns

- The spawns are the prototype's demo unit positions: `ally` for team A, `enemy` for team B. They are on walkable
  ground in the prototype, so they are kept as they are. The roster order of M2-a keeps its meaning: the first
  position of a team is its sniper, then its wizard, then its priest.
- `spawnsFor(board)` is replaced by the map's own `spawns`. The old corner rule and the "clear the landing to
  level 1" rule of `map-variety` are dropped, because the prototype's positions are already legal.

#### 4.5 The wire

- `StateMessage` becomes `{ version: 3, mapId: 'street' | 'park' | 'roof', state }`.
- The server sends the id of the match's map in every state message. The map is picked by `mapIndex(seed)`,
  as before.
- The client keeps the last `mapId` with the last state. A state with a different `version` is refused with
  "Versão incompatível", as today.

### 5. Tests planned

**`prototype-maps.test.ts`** (backend and frontend copies, the same cases)
- [ ] Each map has 10 rows of 10 characters, and every character is a tile letter the prototype defines.
- [ ] Each map has 10×10 heights; the sum, the void count and the letter counts equal the constants of §4.2.
- [ ] Each map's props equal the prototype's props, counted by type (the counts are recorded in the test).
- [ ] The backend and the frontend copies are equal: the same checksums, the same spawns.

**`map.test.ts`** (backend)
- [ ] `boardOf` returns a 10×10 board for each map, whose levels equal the heights, with void as 0.
- [ ] Reachability with the 8-neighbour rule and the step rule (|Δ| ≤ 1, void never entered): a flood fill from
      the team A spawns reaches every team B spawn, for each map. The test fails with the first unreachable spawn.
- [ ] Every non-void cell is either reachable from the spawns or listed in a `KNOWN_UNREACHABLE` constant per map,
      with the reason written beside it. The list is reviewed by the owner in M3; the test checks that the list is
      exact (no more, no less).
- [ ] `mapIndex(seed)` is stable and covers the three maps; `createMatchSetup(seed)` returns the map of its seed.

**`protocol`** (backend and frontend)
- [ ] `PROTOCOL_VERSION` is 3 on both sides, and both `StateMessage` types have `mapId`.

### 6. Dependencies

- None.
- M2 reads `PROTOTYPE_MAPS` and the `mapId`.

### 7. Execution steps

1. Write the generator outside the repository, run it on the three maps, and check the numbers against a hand count
   for two cells of each map (for example `street` (0,0) = 6, `roof` (0,0) = 8).
2. Write `prototype-maps.ts` with the table, the props, the spawns and the constants.
3. Write `prototype-maps.test.ts` (backend), then the frontend copy and its test.
4. Update `map.ts`, `map.test.ts`, the protocol copies and `battle-room.ts`.
5. Run `npm test` at the root, `npm run typecheck`, and `npm run build`.
6. Record the `KNOWN_UNREACHABLE` lists in the PR for the owner.

### 8. Acceptance

- [ ] Root `npm test` green on Node 22.
- [ ] Both copies of the map data are equal (the test proves it).
- [ ] Every map's spawns are reachable from each other.
- [ ] The owner has seen the `KNOWN_UNREACHABLE` lists.
- [ ] `backend/engine/` unchanged (`git diff develop -- backend/engine/` empty).

### 9. Out of scope

- Drawing the maps (M2).
- The look of the maps and the units (M2, M3).
- The prototype's demo overlays: the threat line, the demo units' figures, the move and attack highlights.
- The `title` of each map in the lobby.
