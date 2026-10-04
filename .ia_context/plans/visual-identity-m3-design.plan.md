# Plan — Visual identity, M3: design (chrome, board heights, legend, result)

**Milestone:** m3-design
**Parent feature:** [visual-identity.index.md](./visual-identity.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Finish the identity on everything that is not a unit: the board's height colours, the HUD frames, the
buttons, the carousel chips, the lobby and boot titles, the legend, and the result line. Then remove the
`FONT` alias left by M1. This is the milestone the owner reviews by screenshot, because it replaces the
HUD that was approved in M2-a (decision 3 of the index).

### 2. Prerequisites

- `visual-identity-m2-integration` approved, with its manual checklist ticked.
- DT-30 (action buttons offset from their drawing) closed in `.ia_context/inputs/technical-debt.md`.
  This milestone rewrites `Button`, and the DT-30 fix lives in the same widget. If DT-30 is still open,
  stop and ask the owner before starting.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/grid.ts` | modify | `heightColor`: level 0 → `0x23283a`, level 1 → `0x30364a`, level 2 → `0x3f4152` (the prototype's tile tops: asphalt, slab, plaza) |
| `frontend/src/view/grid.test.ts` | modify | Expects the three new values; keeps the distinctness and the `RangeError` tests |
| `frontend/src/view/theme.ts` | modify | Adds `PANEL_INNER_STROKE` (`0xe6dcc4` at alpha 0.12, exported as a number and an alpha), `STAMP_COLOR = ACCENT_COLOR`, `STAMP_WIDTH = 4`. Removes `FONT` (section 4.4) |
| `frontend/src/view/theme.test.ts` | modify | Asserts the new tokens; asserts `FONT` is gone (`import * as theme` has no `FONT`) |
| `frontend/src/view/theme.contrast.test.ts` | create | The contrast matrix in section 5 |
| `frontend/src/scenes/widgets.ts` | modify | `Button`: 1 px `PANEL_STROKE` frame, body font, armed = paper with ink label, DT-30 fix as agreed in its debt item. `createPanel`: outer 1 px frame and inner paper line at alpha 0.12, heading in `FONT_TITLE`. `createTurnChip`: letter in `FONT_TITLE` |
| `frontend/src/scenes/MatchScene.ts` | modify | Legend text (4.3); result in `FONT_TITLE` at `FONT_SIZE.result` inside a stamp frame; panel and log copy in the body font |
| `frontend/src/scenes/LobbyScene.ts` | modify | Title in `FONT_TITLE`; the play button uses the new `Button` |
| `frontend/src/scenes/BootScene.ts` | modify | Title in `FONT_TITLE` |
| `frontend/index.html` | modify | Only if the body background from M2 needs a value change (it should not) |

Not touched: `backend/`, the sprites, `unit-look.ts`, `animation.ts`, `effects.ts`, `presentation.ts`.

### 4. Contracts

#### 4.1 Board

- `heightColor(level)` returns the three new values above. The `RangeError` for any other level stays.
- The unit fills are the same as M1 (`TEAM_COLOR`). Against each height colour, a unit's fill may be
  below 3:1 (for example, the bot's red on the lightest tile is 2.35:1). The separation therefore comes
  from the paper outline of the ground marker (section 5 tests the marker, not the fill). This is a
  known limit of the palette, recorded here so the reviewer does not raise it as a defect.

#### 4.2 Chrome

- **Panel:** outer frame 1 px `PANEL_STROKE`, fill `PANEL_FILL`; an inner line 4 px inside the outer
  edge in `PAPER_COLOR` at alpha 0.12. Heading in `FONT_TITLE`, `FONT_SIZE.unit`, `TEXT_COLOR`.
- **Button:** fill `BUTTON_FILL` (idle), `BUTTON_FILL_DISABLED` (out of reach), `BUTTON_FILL_SELECTED`
  (armed, paper). A 1 px `PANEL_STROKE` frame on all states. Label in `FONT_BODY`, `FONT_SIZE.unit`.
  Armed label `TEXT_COLOR_ON_LIGHT`; disabled label `TEXT_COLOR_DISABLED`; otherwise `TEXT_COLOR`.
- **Carousel chip:** unchanged geometry. Letter in `FONT_TITLE`, `FONT_SIZE.title`, colour from
  `labelColorOn(fill)`. The current-turn ring is `CURRENT_TURN_COLOR` (paper), 3 px.
- **Result:** `FONT_TITLE`, `FONT_SIZE.result`, `TEXT_COLOR`, centred. A stamp frame of `STAMP_WIDTH`
  (4 px) in `STAMP_COLOR` around the text, drawn after the text. The stamp is decorative and carries no
  information, so the contrast rule does not apply to it.
- **Lobby and boot title:** `FONT_TITLE`, `FONT_SIZE.title`, `TEXT_COLOR`.
- **Log and panel rows:** `FONT_BODY`, unchanged sizes.

#### 4.3 Legend (closes DT-27)

The legend in `MatchScene.ts` becomes exactly:

```
Azul-tinta: você · Vermelho: bot · Papel: selecionado
Realce azul: movimento · Realce vermelho: ataque
```

The team names now match the colours (A is ink blue, B is red). DT-27 said the legend called A
"Azul claro" for a beige piece; after M1 the colour of A is ink blue, so the word "Azul" is correct, and
this closes DT-27. Update its status in `technical-debt.md` to Closed, with the reference to this plan.

**Deviation applied during verification.** The wording above was fixed; the *size* was not, and at the
log size (14 px) the first line does not fit. Measured in the browser with the loaded IBM Plex Mono
(0.6 em advance): 446 px for the first line and 404 px for the second, against the 416 px between
`ORIGIN.x` (40) and `SIDEBAR.x` (456) — the first line ran 30 px under the unit panel, over its
"Reação" row. `FONT_SIZE` therefore gains `legend: 12` (382 px, 34 px of clearance); the wording is
unchanged. 13 px fits by 2 px only, which the fallback monospace would not hold, so 12 px is the choice.

#### 4.4 Removing the alias

- Delete `export const FONT = FONT_BODY` from `theme.ts`.
- Replace every remaining `FONT` import with `FONT_BODY` or `FONT_TITLE` as in 4.2.
- `grep -rn "\bFONT\b" frontend/src` must return nothing except `FONT_TITLE`, `FONT_BODY`, `FONT_SIZE`.

### 5. Tests planned

**`theme.contrast.test.ts`** (Node, uses `contrast.ts`):
- [ ] `TEXT_COLOR` on `BG_COLOR` ≥ 4.5 (body text).
- [ ] `TEXT_COLOR_DISABLED` on `BUTTON_FILL` ≥ 4.5 (dimmed but readable). Compute it first; if it fails, raise the value to the lightest muted tone that passes, and record the value in the test.
- [ ] `TEXT_COLOR_ON_LIGHT` on `BUTTON_FILL_SELECTED` ≥ 4.5.
- [ ] `TEXT_COLOR` on `BUTTON_FILL` ≥ 4.5 and on `PANEL_FILL` ≥ 4.5.
- [ ] `TEAM_COLOR.A` and `TEAM_COLOR.B` each ≥ 4.5 against their letter (`labelColorOn`), and the letter is one of `INK_COLOR` or `PAPER_COLOR`.
- [ ] `PAPER_COLOR` on every height colour is ≥ 7:1 (the paper outline of the marker is the separator, see 4.1).
- [ ] `CORPSE_OUTLINE_COLOR` on every height colour is ≥ 7:1.

**`grid.test.ts`**:
- [ ] `heightColor` returns `[0x23283a, 0x30364a, 0x3f4152]`. Distinct, and each differs from `BG_COLOR`.

**`theme.test.ts`**:
- [ ] `FONT` is not exported (`'FONT' in theme` is `false`).
- [ ] `STAMP_COLOR === ACCENT_COLOR`, `STAMP_WIDTH === 4`.

**Manual (owner, screenshots at 1280×720, attached to the PR):**
- [ ] Lobby: title in Special Elite, button with the 1 px frame, no amber anywhere.
- [ ] Match at start: board in the three new height colours; the human's units are ink blue, the bot's red; the legend text is the one in 4.3.
- [ ] Armed "Atacar" is paper with dark text; disabled buttons are visibly dimmer; idle buttons read clearly.
- [ ] Carousel: letters in the title font, the turn ring is paper.
- [ ] Victory or defeat: the result text is in the title font inside the red stamp frame.
- [ ] Clicks on each of the four buttons land on the drawn button (confirms DT-30 is closed in the real client).
- [ ] The owner records approval of the whole HUD in the PR. This replaces the approval recorded in DT-28 for the old look.

### 6. Dependencies

- M2 approved.
- DT-30 closed (section 2).
- Nothing downstream: this is the last milestone of the feature.

### 7. Execution steps

1. Write the contrast tests first, run them, and fix any colour that fails (only `TEXT_COLOR_DISABLED` is expected to need a change; record its new value).
2. `grid.ts` and its test.
3. `theme.ts`: add the stamp and inner-line tokens; write `theme.test.ts` assertions for them.
4. `widgets.ts`: panel, button, chip, in that order. Run the tests after each.
5. `MatchScene.ts`: legend (4.3), result stamp, body font on the panel and log.
6. `LobbyScene.ts` and `BootScene.ts`: title font.
7. Remove the `FONT` alias (4.4) and run the `grep`.
8. Update DT-27 to Closed in `technical-debt.md`.
9. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`.
10. Take the screenshots listed in section 5 and attach them to the PR.

### 8. Acceptance

- [ ] All frontend tests pass, including the new contrast matrix.
- [ ] `npm run build -w @eldritch-alley/frontend` passes with no `FONT` left.
- [ ] No `backend/` file changed.
- [ ] Owner's manual checklist ticked in the PR, with screenshots.
- [ ] DT-27 closed; DT-28 updated to say the approval now applies to the new look.

### 9. Out of scope

- Any change to the engine, the server or the protocol.
- Isometric rendering, a responsive layout for phones, and the mobile tuning the map README lists as a limit.
- Stamps or decorations beyond the result frame (the prototype's "AUTORIZADO" stamp is not added to any screen here; it can be a later plan).
- The language of the UI. The client remains in Portuguese, as it is now. The conflict with `CLAUDE.md` rule 6 is still an open decision for the owner and is not resolved by this plan.
