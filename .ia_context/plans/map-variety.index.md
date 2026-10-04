# Index — Three prototype maps, one drawn at random per match

**Created on:** 2026-10-04
**Branch:** `feat/map-variaty` (the visual identity shipped in its own MR, #8, before this one)
**Source:** `.ia_context/prototypes/eldritch-alley-map-prototype/` (the three 10×10 maps `street`, `park` and `roof`)

## Goal

Stop the match board from reading as a blank plate: the server fills it with one of the prototype's three
maps, chosen at random for each match, and the client draws whatever board the state carries instead of
hard-coding 8×8.

Today `backend/game-server/src/map.ts` holds one 8×8 board with **four non-zero cells out of 64**
(`(2,2)`, `(3,2)`, `(2,3)`, `(3,3)`, all level 1–2) and `createMatchSetup` always uses `MATCH_SEED = 1`.
The isometric board feature left `backend/` untouched on purpose, so the look the owner approved is a flat
plate with one small block on it.

## Decisions taken by this plan

The owner chose the three values below after the M3 review; they are fixed for this plan.

1. **Board size 10×10**, as in the prototype. The client stops hard-coding a size and reads it from the
   public state. `TILE_W` drops from 80 to 64 so the diamond still fits the 640 px gap between the HUD
   panels.
2. **Walls as cliffs, levels 0..3.** A four-tone palette; level 3 is the building mass. The engine already
   refuses a step with `|Δlevel| > 1` (`backend/engine/src/actions.ts`, `'height-step-too-high'`), so a
   3-level block only has to be authored so that **no level-2 cell is within Chebyshev distance 1 of it**
   (diagonals included: the engine steps diagonally, DT-48) and it is impassable. **No engine rule changes.**
3. **Fixed corner spawns, derived from the board size**, as today: A = (0,0), (1,0), (0,1);
   B = (w−1, h−1), (w−2, h−1), (w−1, h−2). On 10×10 that is the (0,0) and (9,9) corners.

## What does not change

- `backend/engine/`: no rule, no type, no test. `validateBoard` is already size-agnostic and the board plus
  the seed already travel in the public state (`PublicState = Omit<MatchState, 'rng'>`), so **`PROTOCOL_VERSION`
  stays 2** and the client needs no protocol change.
- The randomness ADR 0005 forbids: the engine never draws one. The map is a pure function of the seed the
  server already sends, so a match stays replayable action by action.
- The prototype's **props** (cars, lamps, AC units, water towers, window-lit facades) and its *blocked-tile*
  concept (its `B w v h f` list). Only the height field is ported.

## The port: prototype relief to four levels

| Level | Role | Top |
|---|---|---|
| 0 | low ground: asphalt and street, water, the street seen from the roofs | `#23283a` (unchanged) |
| 1 | normal walkable ground: sidewalk, grass, path, plaza, roof deck | `#30364a` (unchanged) |
| 2 | raised walkable ground: hill, higher roof, machine-room platform | `#3f4152` (unchanged) |
| 3 | wall: building mass | `#1a1e2c` (new, the prototype's `B`) |

- **street** — ground (`s a z x`) → 0, buildings (`B`) and the fenced yard (`f`) → 3. Uses two tones.
- **park** — water (`w`) → 0, grass/path/plaza (`g p q`) → 1, hill → 2, buildings (`B`) → 3. Uses all four.
  The hill's `+2` summit is capped at 2, because walkable ground stops at 2: a deliberate fidelity loss.
- **roof** — the gap (`v`) → 0, deck and roofs (prototype 4–6) → 1, higher roofs and the machine room (7–8)
  → 2, building mass (`B`) → 3, the plank at (6,4) → 2. The lossiest compression; the invariants decide each
  cell, and the plank stays the only crossing of the gap.

## Milestones (frontend order: logic → integration, then server content and design)

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [map-variety-m1-logic.plan.md](./map-variety-m1-logic.plan.md): size-driven projection and picking, four-tone palette (no Phaser) | [x] concluído | — |
| 2 | [map-variety-m2-integration.plan.md](./map-variety-m2-integration.plan.md): the client draws the board the state carries | [x] concluído | — |
| 3 | [map-variety-m3-server.plan.md](./map-variety-m3-server.plan.md): three 10×10 maps, spawns by size, one drawn at random per match (DT-32 first) | [x] concluído | — |
| 4 | [map-variety-m4-design.plan.md](./map-variety-m4-design.plan.md): design pass by screenshot, owner approval | [ ] pendente | — |

## Dependency notes

- M2 depends on M1: the projection has to take a size before the scene can pass one.
- M3 depends on M2: the server can only send a 10×10 board once the client draws one. Landing M2 alone
  changes nothing on screen — the server still sends 8×8, drawn at the new tile size.
- M3 also carries the DT-32 fix, because its trigger is "before the next change to `backend/game-server`"
  and the new map tests cannot run without it.
- M4 depends on M3: the screenshots have to show the three real maps.
- DT-44 (attack effects drawn beneath the board) stays open and is not fixed here.
