# Plan — Visual identity, M1: logic (tokens, contrast, unit look, timelines, effect table)

**Milestone:** m1-logic
**Parent feature:** [visual-identity.index.md](./visual-identity.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Put every number of the identity into tested, Phaser-free modules: the palette and type tokens, the
letter-colour rule with its WCAG check, the pure choices for a unit's sprite, markers and bars, the
animation timelines in milliseconds, and the table of attack effects. M2 draws these; M3 restyles the
chrome with the same tokens. This milestone draws nothing new. The only visible change is that the
colours in `theme.ts` change, because the scenes read them.

Contract exposed to M2: the exports listed in section 3, with the exact values in section 4.

### 2. Prerequisites

- None. Runs in Node with Vitest, like the existing `view/` and `game/` tests.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/contrast.ts` | create | `luminance(color: number): number` and `contrastRatio(a: number, b: number): number`, both WCAG 2.x. Moved out of `theme.test.ts`, so the code and the tests use one implementation |
| `frontend/src/view/contrast.test.ts` | create | Known values: black/white = 21, equal colours = 1, order-independent |
| `frontend/src/view/theme.ts` | modify | New token values (section 4.1), new `FONT_TITLE` and `FONT_BODY`, `FONT` kept as an alias of `FONT_BODY` until M3 removes it, `labelColorOn` rewritten (section 4.2), `BG_COLOR`, `WARM_COLOR`, `ACCENT_COLOR`, `PAPER_COLOR`, `INK_COLOR` |
| `frontend/src/view/theme.test.ts` | modify | Asserts the new values; replaces the test that a letter takes the other team's colour; keeps the dimmed-text test |
| `frontend/src/view/unit-look.ts` | create | Pure choices for drawing a unit (section 4.3) |
| `frontend/src/view/unit-look.test.ts` | create | Covers every rule in 4.3 |
| `frontend/src/view/animation.ts` | create | Timelines in milliseconds and the frame choice at an elapsed time (section 4.4) |
| `frontend/src/view/animation.test.ts` | create | Covers every frame boundary in 4.4 |
| `frontend/src/view/effects.ts` | create | The attack effect table per class and style (section 4.5) |
| `frontend/src/view/effects.test.ts` | create | Every class in the roster has both styles |

Not touched: `grid.ts` (M3 changes the height colours), the scenes, the widgets, `backend/`, `docs/adr/`.

### 4. Contracts and exact values

#### 4.1 Palette and type (`theme.ts`)

All values are `0xRRGGBB` numbers for shapes and `#rrggbb` strings for text.

| Token | Value | Use |
|---|---|---|
| `BG_COLOR` | `0x0b0e18` | Canvas and page background (replaces `#1b1a24`) |
| `PANEL_FILL` | `0x131622` | Frames and the log (carbon paper) |
| `PANEL_STROKE` | `0x3a3f55` | Frame and bar track |
| `PAPER_COLOR` | `0xe6dcc4` | Primary text ink (aged paper) |
| `TEXT_COLOR` | `'#e6dcc4'` | Every text the player reads |
| `TEXT_COLOR_DISABLED` | `'#9b937f'` | Dimmed text (muted) |
| `INK_COLOR` | `0x0b0e18` | Text on paper |
| `TEXT_COLOR_ON_LIGHT` | `'#0b0e18'` | Label of an armed button |
| `ACCENT_COLOR` | `0xc8322a` | Stamp red: decoration and the primary action outline |
| `TEAM_COLOR` | `{ A: 0x6f95d6, B: 0xd9473d }` | A is the human (ink blue), B is the bot (enemy red, the prototype's armband value) |
| `WARM_COLOR` | `0xf0d9a0` | Ammunition pips |
| `ACTIVE_AMBER` | removed | The amber becomes paper (decision of the owner) |
| `SELECTED_COLOR` | `0xe6dcc4` | Stroke of the selected unit |
| `CURRENT_TURN_COLOR` | `0xe6dcc4` | Ring of the carousel chip on turn |
| `CORPSE_COLOR` | `0x4a4a4a` | Fill of a fallen unit (unchanged) |
| `CORPSE_OUTLINE_COLOR` | `0xe6dcc4` | Outline of a fallen unit, so its silhouette reads on every height |
| `BUTTON_FILL` | `0x23283a` | Idle button |
| `BUTTON_FILL_DISABLED` | `0x171b28` | Out of reach |
| `BUTTON_FILL_SELECTED` | `0xe6dcc4` | Armed button (paper), label `TEXT_COLOR_ON_LIGHT` |
| `HIGHLIGHT_MOVE_COLOR` | `0x6f95d6` | Move highlight, alpha `HIGHLIGHT_MOVE_ALPHA = 0.42` |
| `HIGHLIGHT_ATTACK_COLOR` | `0xc8322a` | Attack highlight, alpha `HIGHLIGHT_ATTACK_ALPHA = 0.48` |
| `GRID_STROKE_COLOR` | `0x000000` | Unchanged |
| `FONT_TITLE` | `'"Special Elite", "Courier New", monospace'` | Titles, panel headings, the result |
| `FONT_BODY` | `'"IBM Plex Mono", ui-monospace, monospace'` | Everything else |
| `FONT` | `= FONT_BODY` | Alias for M2 and M3 to migrate from. M3 deletes it |
| `FONT_SIZE` | `{ title: 32, unit: 18, log: 14, result: 48 }` | `result` is new; the result line stops being a literal `'48px'` |

#### 4.2 Letter colour (`labelColorOn`)

The letter on a fill is whichever of `INK_COLOR` or `PAPER_COLOR` has the higher contrast ratio on that
fill. It returns one of those two numbers, and never a team colour. Checked values, with the
resulting ratios that the tests must reproduce to two decimals:

| Fill | Letter | Ratio |
|---|---|---|
| `TEAM_COLOR.A` `#6f95d6` | ink `#0b0e18` | 6.37 |
| `TEAM_COLOR.B` `#d9473d` | ink `#0b0e18` | 4.51 |
| `CORPSE_COLOR` `#4a4a4a` | paper `#e6dcc4` | 6.50 |

The enemy red is the prototype's value, unchanged. It only passes the 4.5:1 floor with the ink
`#0b0e18`; with the old ink `#1b1a24` it gave 4.03:1. The margin is small (4.51), so the test must keep
the floor at exactly 4.5, and any future change of either colour has to re-run it.

Contrast helpers come from `contrast.ts`; `labelColorOn` must not duplicate the formula.

#### 4.3 Unit look (`unit-look.ts`)

Pure functions. Team `A` is the human side.

- `spriteSheetOf(team: Team): 'ally' | 'enemy'`. `A` → `'ally'`, `B` → `'enemy'`.
- `classRow(primaryClass: string): number | null`. `sniper` → 3, `wizard` → 4, `priest` → 5. Any other class → `null`. The rows are 0-based and follow the README order (Combatant 0, Initiate 1, Adept 2, Sniper 3, Wizard 4, Priest 5, Street Vendor 6). Only the three classes of the M2 roster have a row in use.
- `frameIndex(row: number, column: number): number` = `row * 10 + column`. Columns: idle 1 = 0, idle 2 = 1, walk 1 = 2, walk 2 = 3, melee 1 = 4, melee 2 = 5, ranged 1 = 6, ranged 2 = 7, resource 1 = 8, resource 2 = 9.
- `healthFraction(unit): number`. `clamp(health / maxHealth, 0, 1)`. A `maxHealth` of 0 returns 0.
- `pipsFor(unit): { total: number; filled: number } | null`. `null` when `magazine` is `null` (wizard, priest: the engine has no mana yet, ADR 0002). Otherwise `total = magazine`, `filled = ammo`, both clamped to `0..total`.
- `markerStyle(team: Team): { diamond: true; corners: boolean }`. `corners` is `true` for `B` only.

#### 4.4 Timelines (`animation.ts`)

All times in milliseconds from the start of the action. Values come from the characters README §3.

```ts
export const ATTACK_TIMELINE = {
  windupStart: 250,    // frame 1 from here
  strikeStart: 520,    // frame 2 from here
  strikeEnd: 760,      // the strike ends; the pip is spent at this moment
  travelStart: 600,    // ranged only
  impactLength: 260,
  recover: 2000,       // back to idle
} as const;

export const RELOAD_TIMELINE = {
  start: 300,          // frame 1; ground effect fades in over 200
  secondHalf: 760,     // frame 2 from here
  pipInterval: 140,    // pips refill one by one, one every 140 from 760
  end: 1180,           // ground effect fades out over 160; Sniper bolt click here
  fadeIn: 200,
  fadeOut: 160,
} as const;

export const IDLE_STEP_MS = 500;      // idle breathing: frame 2 every 500 ms, one pixel lower
export const WALK_STEP_MS = 150;      // walk frames alternate every 150
export const MOVE_MS_PER_CELL = 120;  // decision of this plan, not in the prototype
```

Functions:

- `attackFrame(elapsedMs: number): 1 | 2 | 0`. Exact rule: `< 250` → `0`; `< 520` → `1`; `< 760` → `2`; otherwise `0` (the recover phase until 2000 shows idle, so it is `0` too).
- `reloadFrame(elapsedMs): 1 | 2 | 0`. `< 300` → `0`; `< 760` → `1`; `< 1180` → `2`; otherwise `0`.
- `filledPipsAt(elapsedMs, from: number, to: number): number`. Before 760 → `from`. From 760, pip `i` (0-based) becomes filled at `760 + 140 * i`. Result is the number of pips filled at that time, clamped to `from..to`.
- `idleFrame(elapsedMs): 1 | 2`. `Math.floor(elapsedMs / IDLE_STEP_MS) % 2 === 0` → `1`, otherwise `2`.
- `walkFrame(elapsedMs): 1 | 2`. `Math.floor(elapsedMs / WALK_STEP_MS) % 2 === 0` → `1`, otherwise `2`.
- `movementDuration(cells: number): number`. `cells * MOVE_MS_PER_CELL`, with `cells` a non-negative integer.

#### 4.5 Attack style and effects (`effects.ts`)

- `attackStyle(actor: Position, target: Position): 'melee' | 'ranged'`. Chebyshev distance: `≤ 1` → `'melee'`, otherwise `'ranged'`. The style never changes damage or cost (rule of the prototype).
- `EFFECTS: Record<string, { melee: Effect; ranged: Effect }>` for `sniper`, `wizard`, `priest`:

| Class | Melee effect `kind` | Ranged effect `kind` | Travel (ms) | Notes |
|---|---|---|---|---|
| `sniper` | `'pistol-flash'` | `'tracer'` | 140 | Warm tracer, `WARM_COLOR` |
| `wizard` | `'gust'` | `'missiles'` | 520 | Three darts in magenta `0xff3df2`, staggered 70 ms, on curved paths |
| `priest` | `'glow-impact'` | `'sky-column'` | 300 | Cyan column `0x3de9ff` falling onto the target |

`Effect` is `{ kind: string; travelMs: number; color: number; staggerMs: number }`. Melee effects have `travelMs: 0`. Neon `0xff3df2` and `0x3de9ff` are the only colours of magic; they appear nowhere else.

### 5. Tests planned

**`contrast.test.ts`**
- [ ] `contrastRatio(0x000000, 0xffffff)` is 21.
- [ ] `contrastRatio(x, x)` is 1.
- [ ] `contrastRatio(a, b) === contrastRatio(b, a)`.

**`theme.test.ts`**
- [ ] Every token in 4.1 has the value in the table. Each of the `TEXT_COLOR*` strings matches `/^#[0-9a-f]{6}$/`.
- [ ] `FONT === FONT_BODY`. `FONT_TITLE` starts with `"Special Elite"`.
- [ ] `labelColorOn` returns `INK_COLOR` for `TEAM_COLOR.A` and `TEAM_COLOR.B`, and `PAPER_COLOR` for `CORPSE_COLOR`.
- [ ] For each fill in 4.2 the letter reaches the ratio of the table, to two decimals, and is at least 4.5.
- [ ] `TEXT_COLOR_DISABLED` is dimmer than `TEXT_COLOR` (the existing brightness test, kept).
- [ ] Move and attack highlights differ; disabled and armed buttons differ from idle.

**`unit-look.test.ts`**
- [ ] `spriteSheetOf('A') === 'ally'`, `spriteSheetOf('B') === 'enemy'`.
- [ ] `classRow('sniper') === 3`, `classRow('wizard') === 4`, `classRow('priest') === 5`, `classRow('soldier') === null`.
- [ ] `frameIndex(3, 9) === 39`, `frameIndex(0, 0) === 0`.
- [ ] `healthFraction` on `{health: 6, maxHealth: 12}` is `0.5`; on `{health: 15, maxHealth: 12}` is `1`; on `{health: 0, maxHealth: 0}` is `0`.
- [ ] `pipsFor` with `magazine: null` returns `null`; with `magazine: 3, ammo: 1` returns `{total: 3, filled: 1}`; with `ammo: 9` clamps to `filled: 3`.
- [ ] `markerStyle('A').corners === false`, `markerStyle('B').corners === true`.

**`animation.test.ts`**
- [ ] `attackFrame`: `0` at 0, 249; `1` at 250, 519; `2` at 520, 759; `0` at 760, 1999, 2000.
- [ ] `reloadFrame`: `0` at 299; `1` at 300, 759; `2` at 760, 1179; `0` at 1180.
- [ ] `filledPipsAt(0, 0, 3)` is `0` at 759 and `0` at 760; at 760 + 140 it is `1`; at 760 + 280 it is `2`; at 760 + 420 it is `3`; it never exceeds `to`.
- [ ] `walkFrame`: `1` at 0 and 149, `2` at 150 and 299, `1` at 300.
- [ ] `idleFrame`: `1` at 0 and 499, `2` at 500 and 999, `1` at 1000.
- [ ] `movementDuration(3) === 360`; `movementDuration(0) === 0`; a negative or non-integer input throws `RangeError`.

**`effects.test.ts`**
- [ ] `attackStyle` on `{0,0}` → `{1,1}` is `'melee'`; `{0,0}` → `{2,0}` is `'ranged'`; `{0,0}` → `{1,1}` diagonal is `'melee'`.
- [ ] Every class in `EFFECTS` has both `melee` and `ranged`; melee `travelMs` is `0`; ranged `travelMs` is the value in the table.
- [ ] The magic colours `0xff3df2` and `0x3de9ff` appear only in `EFFECTS` and are not in `TEAM_COLOR`, `BUTTON_*` or `HIGHLIGHT_*`.

### 6. Dependencies

- None.
- Downstream: M2 imports from `theme.ts`, `unit-look.ts`, `animation.ts` and `effects.ts`. M3 imports `theme.ts`.

### 7. Execution steps

1. Write `contrast.ts` and its test.
2. Update `theme.ts` with the 4.1 values, `FONT_TITLE`, `FONT_BODY`, the `FONT` alias, and the new `labelColorOn`.
3. Update `theme.test.ts`: change the assertions that name the old values, and replace the test that a letter takes the other team's colour.
4. Write `unit-look.ts`, `animation.ts` and `effects.ts` with their tests.
5. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`. The build must pass, because the scenes still import `FONT` and the alias keeps them compiling.
6. Do **not** change any scene, widget or `grid.ts` in this milestone.

### 8. Acceptance

- [ ] All tests pass, including the ones that existed before this plan (except the one replaced in step 3).
- [ ] `npm run build -w @eldritch-alley/frontend` passes.
- [ ] `grep -rn "ACTIVE_AMBER" frontend/src` only finds the definition removed in step 2 (no residual use).
- [ ] No file under `frontend/src/scenes/` or `frontend/src/view/grid.ts` is modified.
- [ ] Reviewer confirms the ratios in 4.2 against the table.

### 9. Out of scope

Drawing anything (M2 and M3). Fonts and sprite files (M2). Height colours in `grid.ts` (M3). Isometric rendering (not planned). Mana pips: the engine has no mana resource yet (ADR 0002), so `pipsFor` returns `null` for wizard and priest.
