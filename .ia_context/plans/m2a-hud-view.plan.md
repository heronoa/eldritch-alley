# Plan — M2-a HUD view: carousel, action bar and status panel on a 1280×720 canvas

**Milestone:** m2a-hud-view
**Parent:** [m2a-hud.index.md](m2a-hud.index.md)
**Created on:** 2026-10-03
**Status:** pendente

---

### 1. Objective

Draw what `m2a-hud-data` computes: a turn-order carousel, an action bar of mode buttons and a unit
status panel, on a canvas enlarged to 1280×720. The scene only draws and forwards clicks — every
label, order, enabled flag and colour is decided in the tested modules.

### 2. Prerequisites

- `m2a-hud-data` approved and merged: `maxHealth` on the state, `PROTOCOL_VERSION` 2, and the
  `turn-order` / `actions` / `highlight` / `panel` modules exist.
- A running game server for the manual checks in section 5 (`GAME_SERVER_PORT`, default 2567).

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/layout.ts` | create | Canvas size, every HUD rectangle, and the pure helpers `buttonRect`, `carouselSlotRect`, `panelRowPoint` |
| `frontend/src/view/layout.test.ts` | create | The rectangles fit and do not overlap |
| `frontend/src/view/theme.ts` | modify | Gains the HUD palette, and absorbs the colours now local to `MatchScene` |
| `frontend/src/view/theme.test.ts` | modify | The new colours are exported |
| `frontend/src/scenes/widgets.ts` | create | `Button`, `createPanel`, `createTurnChip` |
| `frontend/src/scenes/MatchScene.ts` | modify | Draws the carousel, the bar and the panel; owns the armed mode; routes clicks through `applyMode` |
| `frontend/src/scenes/LobbyScene.ts` | modify | Uses `Button`, so there is one way to make a button |
| `frontend/src/main.ts` | modify | 1280×720 with `Scale.FIT` |
| `frontend/src/view/grid.ts` | **unchanged** | The board keeps `ORIGIN = {40, 40}` and `TILE_SIZE = 48` |

### 4. Contracts

#### 4.1 Layout — 1280×720

```
┌───────────────────────────────────────────────────────────────────────┐
│  BOARD (unchanged)          │  TURN ORDER CAROUSEL  456,  40, 784×80   │
│  ORIGIN 40,40  384×384      ├─────────────────────────────────────────┤
│  → 424, 424                 │  ACTION BAR           456, 136, 784×56   │
│                             ├───────────────────┬─────────────────────┤
│  LEGEND  y 440              │  UNIT PANEL       │  LOG                │
│  STATUS  y 464              │  456, 208, 368×300│  840, 208, 400×300  │
└─────────────────────────────┴───────────────────┴─────────────────────┘
```

The board does **not** move. All of the extra 320 px of width and 180 px of height is on the right
and the bottom. That keeps `view/grid.ts` untouched and preserves a useful property: `pixelToCell`
returns `null` for any click in the sidebar (`x >= 424`), so the scene-wide `pointerdown` handler
stays harmless there and no click-region exclusion is needed.

`view/layout.ts` owns:

| Constant | Value |
|---|---|
| `CANVAS_WIDTH` / `CANVAS_HEIGHT` | `1280` / `720` |
| `MARGIN` | `40` |
| `SIDEBAR` | `{ x: 456, y: 40, width: 784 }` |
| `CAROUSEL_RECT` | `{ x: 456, y: 40, width: 784, height: 80 }` |
| `CAROUSEL_SLOT` | `{ width: 96, height: 64, gap: 8 }` |
| `ACTION_BAR_RECT` | `{ x: 456, y: 136, width: 784, height: 56 }` |
| `ACTION_BUTTON` | `{ width: 184, height: 56, gap: 16 }` |
| `PANEL_RECT` | `{ x: 456, y: 208, width: 368, height: 300 }` |
| `PANEL_ROW_HEIGHT` | `40` |
| `LOG_RECT` | `{ x: 840, y: 208, width: 400, height: 300 }` |
| `LOG_LINES` | `14` |
| `LEGEND_Y` / `STATUS_Y` | computed from `ORIGIN.y + BOARD_HEIGHT * TILE_SIZE + gap` |

The action bar fits exactly: `4 × 184 + 3 × 16 = 784`. The carousel holds six slots with room to
spare: `6 × 96 + 5 × 8 = 616 ≤ 784`. The five panel rows at 40 px plus a title sit in 300 px.
`layout.ts` imports the board constants from `grid.ts` rather than restating them, and `main.ts`
imports only `CANVAS_WIDTH` and `CANVAS_HEIGHT`.

#### 4.2 The widget layer

`view/` is Phaser-free by convention — `grid.ts` and `theme.ts` both say so and node tests import
them — so the widgets live in `scenes/widgets.ts`:

```ts
export class Button extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, rect: Rect, label: string, onPress: () => void);
  setEnabled(enabled: boolean): void;   // dims the fill, greys the label, ignores clicks
  setSelected(selected: boolean): void; // marks the armed mode
  setLabel(label: string): void;
}

export function createPanel(scene: Phaser.Scene, rect: Rect, title: string): Phaser.GameObjects.Container;
export function createTurnChip(scene: Phaser.Scene, rect: Rect, entry: TurnSlot): Phaser.GameObjects.Container;
```

`Button` is a class because it is the only widget with per-instance mutable visual state across
ticks. The panel and the carousel are rebuilt wholesale from the pure models on each state message,
so they need no mutable identity and are plain factory functions — no class hierarchy the repository
does not have.

No `Zone`, `NineSlice`, DOM or scroll region is introduced. Three primitives cover the milestone.
If `MatchScene` grows past roughly 400 lines, the sidebar can be lifted into a plain
`scenes/MatchHud.ts` class; that is not worth doing up front.

#### 4.3 Scene behaviour

`MatchScene` gains one new piece of state, `mode: ActionMode`, and its click path becomes:

```
pixelToCell → resolveClick → applyMode(this.mode, intent) → switch on intent.kind
```

- `select` sets `selectedId`; `send` calls `session.send`. `move-preview` and `none` do nothing.
- `reload` and `endTurn` bypass the board entirely: the button calls `session.send` at once.
- `move` and `attack` **toggle** the armed mode (`this.mode === mode ? 'inspect' : mode`), so
  pressing the armed button is the cancel path.

On every `state` message, in this order: refresh `this.state`; **auto-select** the acting unit when
it is on `HUMAN_TEAM`; `this.mode = settleMode(this.mode, availableActions(...))`; then redraw the
grid, the highlights, the units, the carousel, the panel and the buttons. Auto-selection removes the
"click your own piece first" step and guarantees `selectedId` is the actor whenever the player can
act, which is what makes the panel and the highlight meaningful.

The highlight layer is a `Graphics` object added **before** the units container, so the overlay sits
under the pieces. A rejection keeps the mode and the selection and appends
`describeRejection(message.reason)` to the log. `ended` clears the mode and disables the bar.

#### 4.4 Theme

`theme.ts` gains the HUD palette and absorbs what `MatchScene` currently keeps local, so there is one
name per colour: `SELECTED_COLOR`, `CORPSE_COLOR`, `GRID_STROKE_COLOR` (moved from `MatchScene`),
plus `PANEL_FILL`, `PANEL_STROKE`, `BUTTON_FILL`, `BUTTON_FILL_DISABLED`, `BUTTON_FILL_SELECTED`,
`TEXT_COLOR_DISABLED`, `CURRENT_TURN_COLOR`, `HIGHLIGHT_MOVE_COLOR` and `HIGHLIGHT_ATTACK_COLOR`.
`heightColor` stays in `grid.ts` — the height colours are derived, not fixed, and `theme.ts` already
says so.

#### 4.5 Canvas

`main.ts` becomes `width: CANVAS_WIDTH, height: CANVAS_HEIGHT` with
`scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }`. The scale mode is not
decoration: a fixed 1280×720 canvas is cropped outright on a laptop viewport shorter than the
canvas, and `FIT` is the one-line answer. Full responsive layout stays out of scope.

### 5. Tests planned

**Automated** — `npm test -w @eldritch-alley/frontend`, plus `npm run build -w @eldritch-alley/frontend`.

- [ ] `layout.test.ts`: every rectangle is inside `CANVAS_WIDTH × CANVAS_HEIGHT`; the board rect and
      the sidebar do not overlap; the carousel, the action bar, the panel and the log do not overlap
      each other; four buttons fit inside the bar's inner width; six carousel slots fit inside the
      carousel's; `buttonRect` and `carouselSlotRect` place index 0 at the bar's left edge and are
      evenly spaced.
- [ ] `theme.test.ts`: the new constants are exported and are distinct colours.

**Manual, in the browser** — there is no jsdom, no happy-dom and no Phaser test harness, and
`frontend/vitest.config.ts` says "Rendering is not tested here". Everything below has **no automated
coverage** and is the reviewer's checklist:

- [ ] `npm run dev` for the game server and the frontend; open `localhost:5173`; click
      "Jogar contra o bot".
- [ ] The canvas is 1280×720 and fully visible; the board is in the same place it was before this
      plan, and every height level is still distinguishable.
- [ ] The carousel lists six slots in speed order, the acting unit first and marked. It advances as
      turns pass, and a slot disappears when a unit dies.
- [ ] The panel shows the sniper's HP as `12/12`. `Reação` and `Mana` are visible, dimmed and dead to
      the pointer.
- [ ] The four buttons are enabled on the human's turn and all disabled while the bot plays.
- [ ] `Mover` arms the neighbours; clicking one moves and the highlight follows. The mode survives a
      second move and clears when movement runs out.
- [ ] `Atacar` arms only the enemies in reach; after the attack the mode falls back to inspect and
      `Mover` / `Atacar` / `Recarregar` go disabled while `Terminar turno` stays enabled.
- [ ] `Recarregar` reloads, the log says so in Portuguese, and `Munição` returns to full.
- [ ] `Terminar turno` ends the turn, the carousel advances and the bot plays.
- [ ] A rejected action keeps the mode and the selection, and the log shows a Portuguese sentence —
      never a raw enum such as `not-enough-movement`.
- [ ] Killing the server shows "Reconectando..." and the HUD survives the reconnection intact.
- [ ] A full match still ends with Vitória / Derrota.

### 6. Dependencies

- `m2a-hud-data` approved and merged.
- A running game server for the manual checklist.

### 7. Execution steps

1. Write `layout.ts` and its test, then the `theme.ts` additions and their test.
2. Write `scenes/widgets.ts` (`Button`, `createPanel`, `createTurnChip`).
3. Point `main.ts` at the new canvas size, with `Scale.FIT`.
4. Rewrite `MatchScene` around the new layout: grid and units first, then the highlight layer, the
   carousel, the action bar and the panel.
5. Wire the mode: toggle on `move` / `attack`, send at once for `reload` / `endTurn`, settle on every
   state, auto-select the actor.
6. Move `LobbyScene` to `Button`.
7. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`.
8. Walk the manual checklist with a live server.

### 8. Acceptance

- [ ] The frontend suite and the build pass.
- [ ] Every manual check in section 5 passes, and the reviewer records them in the PR.
- [ ] `frontend/src/view/grid.ts` is unchanged.
- [ ] No engine, game-server or protocol file is touched by this plan.
- [ ] No decision about a label, an enabled flag, a colour or a coordinate is taken inside a scene
      method that is not already covered by `game/` or `view/`.

### 9. Out of scope

Responsive layout beyond the single `Scale.FIT`; animation and tweening; tooltips; a selectable-unit
list; scrolling in the log; mana, reaction and ability rules (M3 — ADR 0002, ADR 0007); the DT-24 and
DT-25 fixes; the hard-coded 8×8 board in `view/grid.ts`; artwork, sprites and sound.
