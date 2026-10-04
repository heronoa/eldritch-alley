# Plan — Isometric board, M3: design (the prototype's look on blocks and overlay panels)

**Milestone:** m3-design
**Parent feature:** [iso-board.index.md](./iso-board.index.md)
**Created on:** 2026-10-04
**Status:** concluído, aguardando revisão

---

### 1. Objective

Make the isometric board look like the prototype: the faces, the tile tones, the overlay panels with
their inner line, and the contrast of every piece of text that sits over the board. This is the
milestone the owner reviews by screenshot. The owner's expectation, stated after the last delivery, is
the prototype's look on this board, so the screenshots are compared with
`.ia_context/prototypes/eldritch-alley-map-prototype/screenshots/`.

### 2. Prerequisites

- M2 approved, with its manual list ticked.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/theme.ts` | modify | Face colours as explicit tokens (4.1), overlay tokens (4.3). `shade` is no longer used for faces |
| `frontend/src/view/theme.contrast.test.ts` | modify | Adds the overlay contrast cases of section 5 |
| `frontend/src/view/grid.ts` | modify | `heightColor` values: level 0 `#23283a`, level 1 `#30364a`, level 2 `#3f4152` (unchanged from identity M3). Confirmed, not changed |
| `frontend/src/scenes/BoardTiles.ts` | modify | Uses the face tokens instead of `shade` |
| `frontend/src/scenes/MatchScene.ts` | modify | Overlay panels get the inner line, the alpha, and the title font. Legend and status positions from `layout.ts` |
| `frontend/src/scenes/widgets.ts` | modify | `createPanel` takes the overlay style (alpha, inner line) |
| `frontend/src/view/layout.ts` | modify (only if the screenshots show a collision) | Positions may move by up to 16 px, and only with a new test |

### 4. Contracts

#### 4.1 Faces (explicit colours, prototype tones)

The prototype's tile palette (`eldritch-alley-map-prototype/js/data.js`) gives a top, a left and a right
colour per tile. The board has three levels, so each level takes the prototype tile that matches its
role in the plan:

| Level | Top | Left | Right | Prototype tile |
|---|---|---|---|---|
| 0 | `#23283a` | `#171b28` | `#11141f` | `a` asfalto |
| 1 | `#30364a` | `#212536` | `#1a1d2b` | `r` laje |
| 2 | `#3f4152` | `#2b2d39` | `#22242e` | `q` praça |

- The values are the prototype's. Top values equal `heightColor` in `grid.ts`, so a level has one top
  colour in the whole client.
- `BoardTiles` reads the left and right colours from a `FACE_COLORS` table in `theme.ts`, indexed by
  level. `shade` is kept in `iso.ts` (M1) and its tests stay, but the board does not call it.

#### 4.2 Highlights and grid lines

- Highlight alpha stays `HIGHLIGHT_MOVE_ALPHA = 0.42` and `HIGHLIGHT_ATTACK_ALPHA = 0.48`, the prototype's
  `rgba` values.
- The outline of each face is `#000000` at 1 px, as today.

#### 4.3 Overlay panels

- Frame fill: `PANEL_FILL` (`#131622`) at alpha `PANEL_ALPHA = 0.94`.
- Border: 1 px `PANEL_STROKE` (`#3a3f55`).
- Inner line: `PAPER_COLOR` at alpha `PANEL_INNER_ALPHA = 0.12`, 1 px, drawn 4 px inside the outer edge.
- Heading: `FONT_TITLE` at `FONT_SIZE.unit`, colour `TEXT_COLOR`.
- Body and log: `FONT_BODY`, unchanged sizes.
- Buttons in the action bar: as M3 of the identity feature (paper when armed). Their background is the
  panel style with `BUTTON_FILL`, at full opacity, so their labels never sit on a translucent fill.

#### 4.4 Text over the board

- Legend and status sit on the board's dark background, outside any panel. Their colour is `TEXT_COLOR`
  on the composed background.
- The composed background is the panel fill at alpha `0.94` over the darkest tile that can sit behind
  the panel: `BG_COLOR` (`#0b0e18`) and the board's farthest corner, measured in the test (section 5).

### 5. Tests planned

**`theme.contrast.test.ts`** (Node, `contrastRatio`):
- [ ] `TEXT_COLOR` over the composed panel background (`PANEL_FILL` at 0.94 over `BG_COLOR`) ≥ 4.5.
- [ ] `TEXT_COLOR` over the composed panel background over the lightest height (`0x3f4152`) ≥ 4.5.
- [ ] `TEXT_COLOR_DISABLED` over the composed panel background ≥ 4.5.
- [ ] `PAPER_COLOR` at `PANEL_INNER_ALPHA` over the panel fill is visible: contrast ≥ 1.2 (a subtle line by design,
      about 1.3:1 on the panel; the test stops it from vanishing).
- [ ] Each `FACE_COLORS` entry: the left and right faces are darker than their top (luminance order).

**`grid.test.ts`**:
- [ ] `heightColor` returns `[0x23283a, 0x30364a, 0x3f4152]` and equals `FACE_COLORS[level].top`.

**Manual (owner, screenshots attached to the PR, compared with the prototype's `screenshots/street.png`
and `screenshots/roof.png`):**
- [ ] The board's blocks look like the prototype's: the three tones, darker faces on the sides, the same
      isometric angle.
- [ ] The overlay panels look like the prototype's HUD: dark paper, thin frame, inner line visible.
- [ ] Nothing in the HUD covers a unit that the player must see on the first turn, or, if it does, the
      owner records it as a known limit.
- [ ] Armed "Atacar" is paper with dark text; disabled buttons are dimmer; both read over the board.
- [ ] Victory or defeat: the result still reads, in the title font, inside the stamp frame.
- [ ] The owner records approval of the whole isometric look in the PR. This replaces the approval recorded
      in DT-28 for the flat look, and the flat look is not revisited.

### 6. Dependencies

- M2 approved.
- Nothing downstream.

### 7. Execution steps

1. Write the contrast tests first and run them; fix any value that fails, and record the change.
2. Add `FACE_COLORS` to `theme.ts`, and switch `BoardTiles` to it.
3. Overlay style in `widgets.ts` and `MatchScene.ts`.
4. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`.
5. Take the screenshots: the start of a match, a turn with an armed move, an attack in progress, victory.
   Attach them to the PR next to the prototype's screenshots.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Manual list ticked by the owner, with the screenshots in the PR.
- [ ] `backend/` unchanged.

### 9. Out of scope

- Fading tiles that cover units (a known limit, see the index).
- The AUTORIZADO stamp of the map prototype (it belongs to the map screen, not to the match).
- A back view of the sprites.
- The language of the UI, which stays Portuguese.
