# Plan — Map fidelity, M2: the prototype's drawing on the client, at 2×

**Milestone:** m2-renderer
**Parent feature:** [map-fidelity.index.md](./map-fidelity.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Draw the match board the way `js/app.js` draws the prototype: the sky and skyline behind, every cell with its
palette, the buildings with their windows, the parapets and railings, the props of each map, all in pixel-art
proportions and scaled by 2. Units, highlights, effects and the HUD stay on top, as they are now. The board is
built from the data of M1 and the map id of the state.

### 2. Prerequisites

- M1 approved and merged into the branch: `PROTOTYPE_MAPS`, the `mapId` in the state, protocol version 3.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/maps/prototype-palette.ts` | create | `TILE` (top, left, right for each letter) copied from `data.js`, and the colours used by the drawing (`outline`, `paper`, `neon`, `warm`), with a test that the values match the prototype |
| `frontend/src/view/iso.ts` | modify | The prototype's projection at 2×: `TILE_W = 64`, `TILE_H = 32`, `HZ = 16`, `PIXEL = 2`; `cellToScreen(cell, level, lift)`; `topFace`; `cellAt` skips void cells; `shade` kept for the props' outlines |
| `frontend/src/view/iso.test.ts` | modify | The pinned values of §4.1; the picking rules; void cells are never picked |
| `frontend/src/view/layout.ts` | modify | `TOP_Y` and the board bounds for the tallest block of the three maps (height 11, lift up to 40, see §4.1); the HUD rectangles unchanged |
| `frontend/src/view/grid.ts`, `frontend/src/view/theme.ts` | modify | `heightColor` and `FACE_COLORS` are removed: the palette of §4.2 replaces them. `TEAM_COLOR`, `TEXT_*`, `PANEL_*` stay |
| `frontend/src/view/theme.contrast.test.ts` | modify | The contrast matrix now runs over the tops of the palette that the three maps use (section 5) |
| `frontend/src/scenes/map/backdrop.ts` | create | Sky gradient, stars, the moon of `roof`, the skyline of each sky (port of `drawSky` and `skyline`) |
| `frontend/src/scenes/map/cell.ts` | create | Draws one cell into its own canvas: the three faces, the building (`building`), the parapet (`parapet`), the railings (`railings`), the lines and wires (port of the cell part of `render`) |
| `frontend/src/scenes/map/props.ts` | create | One drawer per prop type that appears in the three maps (section 4.4), each a port of the matching branch of `drawProp` |
| `frontend/src/scenes/map/MapView.ts` | create | Builds the view of one map: the backdrop texture, one texture per cell, the animated props. Owns the depth of each cell (`x + y`) |
| `frontend/src/scenes/BoardTiles.ts` | delete | Replaced by `MapView` |
| `frontend/src/scenes/MatchScene.ts` | modify | Builds `MapView` from the map id; highlights and clicks use the 2× projection; the board does not draw its own grid |
| `frontend/src/scenes/units.ts` | modify | `BODY_SCALE` becomes 2; anchors come from `cellToScreen` with the map's lift |
| `frontend/src/scenes/effects.ts` | modify | Anchors and offsets are the 2× values (`TILE_W` and `TILE_H` are now 64 and 32) |
| `frontend/src/main.ts` | unchanged | `pixelArt: true` already keeps the scaling sharp |

### 4. Contracts

#### 4.1 Projection (2×)

- The prototype's formula, at its scale of 2:
  - `screenX = CX + (x - y) * TILE_W / 2`
  - `screenY = TOP_Y + (x + y) * TILE_H / 2 - (height * HZ) + lift * PIXEL`
  - `CX = 640`. `TOP_Y` is set so that the highest block of the three maps stays between the carousel (bottom at
    y 96) and the action bar (top at y 648). The test computes the bounds and checks the fit.
- The prototype's `lift` (40 on `roof`) moves the whole map down, as `OY` does in `app.js`: `lift * PIXEL` on the
  canvas (80 px). Maps without a lift use 0.
- Top face corners and the picking rules stay as in the isometric plan (`topFace`, `cellAt`), with the new
  constants.
- A void cell (`VOID`) has no top face and no block: it is never returned by `cellAt`.

#### 4.2 Palette

- `TILE[letter] = { top, left, right }` from `data.js`, exactly. Letters that appear on the three maps: `B a z s x f g
  p q w r R v k` and `h` if it appears (the generator lists the letters in use; the palette keeps all of them).
- The drawing uses the prototype's colours for the outlines, the paper marks and the neon, as `app.js` does.
- Units keep the team colours of the approved identity (`TEAM_COLOR`). Their marker outline is tested against the
  tops that the three maps use (section 5).

#### 4.3 Drawing, per cell, in the order of `render`

1. The backdrop, once per map: the sky gradient, the stars (seeded as the prototype), the moon on `roof`, the skyline
   of each `sky` value. The backdrop is one canvas texture at prototype resolution, scaled by 2.
2. For each cell, from the back (smallest `x + y`) to the front: the cell's faces (`isoBox` as in the prototype),
   then its building (`building`) if it is a `B` tile, its parapet and railings on `roof`, its line or wire if any.
   Each cell is drawn into its own canvas, sized to the cell's footprint plus its height and its props, and
   placed at depth `x + y`. This lets the match's units sit between cells exactly as they do in the prototype.
3. The props of each cell, drawn by `props.ts`, inside that cell's canvas. Props that reach into a neighbour are
   drawn in their own cell, as the prototype does.
4. Animated props (the lamps' light, the neon leaks, the particles, the solar and the flyers that move) are drawn
   in a second canvas per cell that is repainted each frame; the static canvas is not repainted.

#### 4.4 Props

- `props.ts` has one drawer for every type that appears in the three maps. The list is the set of `t` values in
  `PROTOTYPE_MAPS` (the generator prints it). The drawers are the prototype's, branch by branch.
- A prop type without a drawer throws `Error('no drawer for prop …')` in the test, so no prop is silently missing.

#### 4.5 Units, highlights and clicks

- The unit sprites keep the approved sheet and frames. They are drawn at 2× (`BODY_SCALE = 2`), so a 16×24 sprite
  is 32×48 on the canvas, the same pixel size as the prototype's figures at its own scale.
- Highlights are diamonds on the top face of each cell, as now.
- Clicks: HUD first, then `cellAt`, as now.
- The depth of a unit is `x + y + 0.5`, as now, so it is drawn between the cell it stands on and the cell in front.

#### 4.6 What is removed

- `BoardTiles.ts`, `heightColor`, `FACE_COLORS`, the three-tone palette of `map-variety`. Their tests are replaced by
  the tests of this milestone; they are not skipped.

### 5. Tests planned

**`iso.test.ts`**
- [ ] `cellToScreen` at scale 2, pinned for the corners of the board at level 0 (for example `(0,0)` and `(9,9)`) and
      for one cell at level 8 on `roof`.
- [ ] The round trip: the centre of every non-void cell, at its level, maps back to that cell; the four corners of
      each top face, four pixels inside, map back too.
- [ ] A void cell is never returned by `cellAt`, even at its own centre.
- [ ] The board's bounds for the three maps fit between y 96 and y 648, and between x 320 and x 960.

**`prototype-palette.test.ts`**
- [ ] Every `TILE` entry equals the prototype's hex values (listed in the test).
- [ ] Each top is lighter than its left and right faces (luminance order), for every letter used on the three maps.

**`props.test.ts`**
- [ ] Every prop type of the three maps has a drawer (the test enumerates the types from the data).
- [ ] The drawers are deterministic: the same prop, the same time, the same pixels (the test compares two runs on a
      small canvas, if the test environment has one; otherwise the check is the owner's, in M3).

**`theme.contrast.test.ts`** (updated)
- [ ] The paper team marker outline is at least 3:1 against every top the three maps use. The test lists those
      tops. If a top fails, the test names it, and the owner decides the change (the palette is data, the decision
      is not the executor's).
- [ ] The panel text contrast tests of the identity feature still pass over the new backdrop colours.

**Automated, root:**
- [ ] `npm test` green on Node 22.
- [ ] `npm run build -w @eldritch-alley/frontend` green.

### 6. Dependencies

- M1 approved.
- M3 depends on this milestone being approved.

### 7. Execution steps

1. Write the palette test and the projection tests first; see them fail.
2. `prototype-palette.ts` and `iso.ts` with the 2× constants; `layout.ts` bounds.
3. `backdrop.ts`, then `cell.ts`, then `props.ts` (one drawer at a time, with its test), then `MapView.ts`.
4. Replace the board in `MatchScene.ts`; delete `BoardTiles.ts`, `heightColor`, `FACE_COLORS` and the code that used them.
5. Update `units.ts` and `effects.ts` to the 2× values.
6. Run the frontend suite, the typecheck, the build, and open the match in a browser to see that it draws (the look is
   checked in M3).

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Every map draws in the browser with no missing prop, no blank cell and no error in the console.
- [ ] No `console.log` in the new files.
- [ ] `backend/engine/` unchanged.

### 9. Out of scope

- The look compared with the screenshots (M3).
- The demo overlays of the prototype (the threat line, the demo units, the move and attack highlights).
- Sound and any new animation not in the prototype.
