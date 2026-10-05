# Map fidelity M3 — a match on each of the three maps

Screenshots of a real match, taken at its start, one per map, for the comparison of
[`map-fidelity-m3-validation.plan.md`](../../plans/map-fidelity-m3-validation.plan.md) §4.

**Taken on:** 2026-10-04, branch `feat/map-variety`, at 1280×720 (the canvas's native size).

| Capture | Prototype screenshot it is compared with | Prototype map |
|---|---|---|
| [`street.png`](./street.png) | `eldritch-alley-map-prototype/screenshots/street.png` | Rua do Comércio e beco |
| [`park.png`](./park.png) | `eldritch-alley-map-prototype/screenshots/park.png` | Praça Municipal nº 3 |
| [`roof.png`](./roof.png) | `eldritch-alley-map-prototype/screenshots/roof.png` | Edifício Central, cobertura |

The board is 640 px wide, centred: it occupies x 320..960 of the capture. The HUD panels sit either side
of that band and the buttons below it, so the whole board is visible under them, and the comparison is
made on the map.

## How each one was taken

The room draws its map from a random seed, so the only way to photograph a given map is to keep starting
matches until it turns up. Each attempt ran against a game-server of its own — on a port of its own, so a
dev server on 2567 is not disturbed — because a room holds the dropped human's seat for its reconnection
window and the next page load would otherwise join the same room and the same board. The page was driven
over Chrome DevTools: open the lobby, press play, wait for the state, capture.

Two checks decided whether an attempt was kept, so that a capture can never be filed under the wrong map:

- **the board is the map it claims to be.** The ten rows of the state's `levels` were compared with the
  heights `prototype-maps.ts` ships for that map id, with a gap levelled to 0 as the server sends it. All
  three matched; the scene's own `mapId` agreed in every case.
- **it is the match at its start.** The six units were in the cells the prototype's `data.js` demo
  positions give, all of them, in every capture:

  | Map | Team A | Team B |
  |---|---|---|
  | `street` | (4,9) (3,9) (5,9) | (4,1) (1,2) (7,1) |
  | `park` | (5,9) (4,9) (6,9) | (8,3) (9,4) (8,5) |
  | `roof` | (1,8) (0,9) (1,9) | (7,7) (8,3) (1,1) |

No exception and no console error was seen in any of the four attempts it took to collect the three maps.

## What is different on purpose

The comparison is of the map; these differences are decisions of the feature, not defects of the drawing.

- **The HUD floats over the board** — the panels, the initiative bar, the buttons. The prototype's own
  panels are excluded from the comparison by §4 of the plan.
- **The units are the sprites approved in the visual identity feature**, drawn at 2× so they match the
  tile, not the prototype's 14×17 placeholders (decision 5 of the index).
- **The demo's overlays are absent** — the red threat line, the demo units, the move and attack
  highlights (decision 6). The white diamonds and bars in the captures are this game's own selection
  marks, drawn by the match and not by the map.
- **The prototype's page is not copied** — its tabs, its briefing panels and its log are the prototype's
  own chrome; 1440×860 against 1280×720 here.

## Checklist (§5), per map

Every item is the owner's to tick. What follows each box is what the capture shows, as evidence and not
as a substitute for the look.

### `street` — Rua do Comércio e beco

**Ground and heights**
- [ ] Every tile has the colour of its letter: asphalt, sidewalk, alley, grass, path, plaza, water, roof slab, gravel, gap, plank. — *asphalt road, kerbed sidewalks, the one-wide alley, the parking lot's gravel.*
- [ ] The heights read as the prototype's: the same blocks are tall and the same ones are low. — *the building mass stands well over the street; the street and the lot are at the low tone.*
- [ ] The gap of `roof` is void, and the plank crosses it at its one row. — *no gap on this map.*

**Buildings and structures**
- [ ] The buildings have the prototype's facades and window lights. — *lit windows over the whole mass, in the prototype's pattern.*
- [ ] `roof` has its parapet, its railings and its lines and wires. — *no parapet or clothesline on this map; the wires are drawn (below).*
- [ ] `street` has its shop fronts and its fence. — *the two shop fronts at the mouth of the alley; the fence around the parking lot, posts and rails.*

**Props and details**
- [ ] Every prop of the prototype's map is there, at its cell, in its style (cars, lamps, trees, bushes, benches, fountain, bins, hydrant, AC units, antenna, satellite dish, solar panels, skylights, puddles, tape, chalk). — *cars on the street and in the lot, the traffic lights, the lamp glow, the tree by the alley, the bins, the neon leak and the taped markings, AC units on the facades.*
- [ ] The animated parts move: the lamps' light, the neon leaks, the particles. — *the leak's glow and the lamp light are drawn on the moving layer; the capture is one frame of them.*

**Sky**
- [ ] `street` and `park` have the prototype's sky; `roof` has its moon and its skyline. — *the two skylines and the fog band, with stars.*

**Units and play**
- [ ] The units stand on the ground, not inside a block, and a block in front of a unit hides it. — *all six stand on their cells; the blocks in front occlude as they should.*
- [ ] Each team's spawns are the prototype's demo positions (ally at the bottom or left, enemy at the top or right, as in the prototype). — *A along the bottom sidewalk, B across the street, at the cells listed above.*

### `park` — Praça Municipal nº 3

**Ground and heights**
- [ ] Every tile has the colour of its letter. — *grass, the stone plaza and its paths, the pond's water, the raised grass of the hill.*
- [ ] The heights read as the prototype's. — *the plaza is a step above the grass, the hill a step above that, in the prototype's shape.*
- [ ] The gap of `roof` is void, and the plank crosses it at its one row. — *no gap on this map.*

**Buildings and structures**
- [ ] The buildings have the prototype's facades and window lights. — *the border blocks, lit, hemming the square on three sides.*
- [ ] `roof` has its parapet, its railings and its lines and wires. — *not this map.*
- [ ] `street` has its shop fronts and its fence. — *not this map.*

**Props and details**
- [ ] Every prop of the prototype's map is there, at its cell, in its style. — *the trees, the bushes, the benches, the lamp posts, the fountain with its jet, the chalk circles on the grass, the leak's glow.*
- [ ] The animated parts move. — *the water's shimmer, the fountain and the leak are on the moving layer.*

**Sky**
- [ ] `street` and `park` have the prototype's sky; `roof` has its moon and its skyline. — *the two skylines and the fog band, with stars.*

**Units and play**
- [ ] The units stand on the ground, not inside a block, and a block in front of a unit hides it. — *all six stand on their cells, none inside a block.*
- [ ] Each team's spawns are the prototype's demo positions. — *A on the plaza's south edge, B on the hill's east side, at the cells listed above.*

### `roof` — Edifício Central, cobertura

**Ground and heights**
- [ ] Every tile has the colour of its letter. — *roof slabs, the raised deck and its glass corridor, the gravel strip, the dark gap.*
- [ ] The heights read as the prototype's. — *the machine room stands over the deck, the neighbour roof over that, the deck drops to the gap.*
- [ ] The gap of `roof` is void (no floor), and the plank crosses it at its one row. — *the void band shows no floor and no drop; the plank crosses it at its row, at (6,4).*

**Buildings and structures**
- [ ] The buildings have the prototype's facades and window lights. — *the facades below the parapet, lit, all the way down.*
- [ ] `roof` has its parapet, its railings and its lines and wires. — *the parapet along the edges that look onto the gap or off the map; the clothesline with its washing, swaying, and the wires. The prototype's own `railings()` is never called in its `app.js`, so there is nothing drawn to compare a railing with.*
- [ ] `street` has its shop fronts and its fence. — *not this map.*

**Props and details**
- [ ] Every prop of the prototype's map is there, at its cell, in its style. — *the antenna, the satellite dish, the vents and AC units, the solar panels, the skylight, the crates, the chalk and the leak, the puddle.*
- [ ] The animated parts move. — *the antenna's light, the leak, and the clothesline's sway are on the moving layer.*

**Sky**
- [ ] `street` and `park` have the prototype's sky; `roof` has its moon and its skyline. — *the moon with its bite and its glow, two skylines and the city glow.*

**Units and play**
- [ ] The units stand on the ground, not inside a block, and a block in front of a unit hides it. — *all six on the decks, the machine room occluding the unit behind it.*
- [ ] Each team's spawns are the prototype's demo positions. — *A on the lower deck's west end, B on the upper deck's east side, at the cells listed above.*

## Reachability decisions (§6) — awaiting the owner

The `KNOWN_UNREACHABLE` lists of M1 are the building masses that hem each map in. None of them is on the
path between the two spawns; all are decor:

| Map | Cells | Reason, as `map.test.ts` gives it |
|---|---|---|
| `street` | row 0 and row 9 whole, columns 0 and 9 whole, and (5,0..3), (6,0..2), (7,0..3), (8,0..3), (9,0..2) | the building mass around the street: 3 to 7 levels above the road it fronts |
| `park` | column 0 whole, and row 0 from (0,1) to (0,9) | the buildings on the park border: 4 to 6 levels above the grass |
| `roof` | (0,7..9) and (1,7..9) | the neighbour roof across the gap: level 11, five and six levels above everything it touches |

The executor's reading is **A/C**: they stay unreachable as decor, no height is rewritten, no checksum of
M1 moves and `map.test.ts` keeps its lists. The owner's word is what closes it.
