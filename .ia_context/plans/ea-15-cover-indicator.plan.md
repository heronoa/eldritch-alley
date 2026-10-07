# Plan: EA-15 · Cover on the screen: the badge, the marks setting, and the log

**Milestone:** —
**Parent feature:** m3-rules-and-content — the owner's request while reviewing m3-01
**Requires:** m3-01 merged (the board carries typed props, `bbd8865`) and ADR 0012 accepted
**Created:** 2026-10-07
**Status:** ready for review — waiting for the owner's approval before any code

## 0. Findings

- **The client draws the marks and cannot stop drawing them.** Since m3-01 `MapView` paints a
  diamond into each marked cell's still canvas (`frontend/src/scenes/map/MapView.ts`, `addCell`),
  from `state.board.props`. A player who has not read ADR 0012 reads them as part of the art — the
  owner's first question about the build.
- **Nothing on the unit says it is in cover.** The rule lowers the chance to hit, and the only
  evidence on the screen is a diamond under a nearby car.
- **The engine cannot answer "which side".** `coverFor(board, target, attacker)` needs an attacker.
  The badge needs the sides of a unit with nobody shooting, so it reads the board itself through
  `propAt`/`propsOf`, which the engine exports.
- **A prop under the feet was cover, and stops being.** ADR 0012 § D4 gives the target cover when a
  `cover` prop stands on its own cell, "from every direction". The owner rejected that on 2026-10-07:
  a unit on top of the car is more exposed, not covered all round. ADR 0012 is committed, and an
  accepted ADR is not rewritten, so this is a new ADR that supersedes the clause
  (`backend/engine/src/cover.ts:34` is the code that carries it, `cover.test.ts:75` the test).
- **The compass is already fixed by m3-02.** Its D1 makes a squad spawning on the west edge start
  facing East, so **East is +x**; the map is read with row 0 at the top, so **North is −y**. This plan
  uses that frame, and the names do not change when the camera turns (the owner's answer): a badge is
  a statement about the board, not about the view.
- **The settings panel has room for a third row.** `SETTINGS_PANEL_RECT` is
  `TITLE_HEIGHT + 2 * PANEL_ROW_HEIGHT + PADDING` = 136 px tall (bottom 294); a third row makes it
  176 px (bottom 334), still above `DASHBOARD_RECT` and inside the canvas.
- **The log knows neither positions nor the board.** `describeEvent(event, names)` is a pure
  formatter over one event (`frontend/src/game/log.ts`), and the scene calls it with an empty name
  record (`MatchScene.ts:865`). The shooter's cover needs both the board and where the two stand, so
  the call has to carry them.
- **The Phaser stub swallows `Text`** (`frontend/src/scenes/testing/phaser-stub.ts`), so the sentence
  on the screen cannot be read back in a test. The testable seam is the pure module that produces it.

## 1. Objective

Three things, one subject — cover stops being invisible:

1. **The rule is corrected**: a prop under the feet of either end gives no cover (ADR 0013),
2. **The badge**: every unit beside a cover prop says so over its head, naming the sides
   ("Em cobertura a leste" / "In cover for East"), and the debug diamonds become a setting the player
   can switch off — **Realçar Coberturas** / **Highlight Covers**, on by default, with
   `VITE_HIGHLIGHT_COVERS` deciding what a build starts with,
3. **The log**: a shot that lands or misses against a covered unit says so, and so does a shot thrown
   from cover.

`PROTOCOL_VERSION` stays 7: nothing new travels over the wire.

## 2. Changes by layer

### Part A — the rule and its record (`backend/engine`, `docs/adr`)

| File | Operation | What changes |
|---|---|---|
| `backend/engine/src/cover.ts` | modify | `coverFor` loses the clause that reads the target's own cell; only the eight neighbours count, and both ends are read the same way. The doc comment states the symmetry: a prop under the feet of either end is not between the two |
| `backend/engine/src/cover.test.ts` | modify | The case at :75 flips to "gives no cover from the prop the target itself stands on", with the owner's reason |
| `docs/adr/0013-no-cover-under-the-feet.md` | create | The new record: context, the decision that supersedes ADR 0012 § D4, and its consequences |
| `docs/adr/README.md` | modify | The row for 0013 |

### Part B — the rule of the badge (`frontend/src/game`)

| File | Operation | What changes |
|---|---|---|
| `src/game/coverBadge.ts` | create | The sides a unit is covered on, and the sentence for its head (§3) |
| `src/game/highlightCovers.ts` | create | The setting: `HIGHLIGHT_COVERS_KEY`, `readHighlightCovers`, `saveHighlightCovers`, over `browserStorage()`, the shape `autoEndTurn.ts` has |
| `src/game/coverBadge.test.ts` | create | §4 |
| `src/game/highlightCovers.test.ts` | create | §4 |
| `src/game/log.ts` | modify | The `attacked` branch names the cover of both ends (§3) |
| `src/game/log.test.ts` | modify | §4 |

### Part C — the build's default (`frontend/src/config.ts`)

| File | Operation | What changes |
|---|---|---|
| `src/config.ts` | modify | `VITE_HIGHLIGHT_COVERS?: string` in `BuildEnv`, and `highlightCoversDefault(env)` beside `gameServerEndpoint` (§3) |
| `src/config.test.ts` | modify | §4 |

### Part D — the board and the unit (`frontend/src/scenes`)

| File | Operation | What changes |
|---|---|---|
| `src/scenes/map/MapView.ts` | modify | A mark stops being painted inside the cell's still canvas and gets a layer of its own at `LAYER.highlight(cell)`, so hiding the marks is a `setVisible` and never a repaint. New `setMarksVisible(visible)` |
| `src/scenes/units.ts` | modify | `UnitSprite` gains a `Text` above the pips and `setCoverBadge(text: string \| null)`; the sprite writes the string it is handed and decides nothing |
| `src/scenes/MatchScene.ts` | modify | Holds the setting (read at boot over the build's default), toggles and saves it on a click inside the new row, hands it to the HUD and to `mapView.setMarksVisible`, pushes each unit's badge on every state message, and hands the log the board and the positions the events are read against |
| `src/scenes/MatchScene.test.ts` | modify | §4 |

### Part E — the HUD and its geometry

| File | Operation | What changes |
|---|---|---|
| `src/view/layout.ts` | modify | `SETTINGS_COVERS_ROW_RECT` under the pan row, and `SETTINGS_PANEL_RECT.height` becomes `TITLE_HEIGHT + 3 * PANEL_ROW_HEIGHT + PADDING` |
| `src/view/layout.test.ts` | modify | §4 |
| `src/view/theme.ts` | modify | `COVER_BADGE_FILL` (paper) and `COVER_BADGE_STROKE` (ink), so the badge's legibility is measured by the contrast test that already measures the paper marker |
| `src/view/theme.contrast.test.ts` | modify | §4 |
| `src/scenes/HudScene.ts` | modify | `HudView.highlightCovers: boolean` and the third settings row: a checkbox and the label `t('hud.settings.highlightCovers')`, drawn the way the automatic end of turn row is |

### Part F — the words (`frontend/src/i18n`)

| File | Operation | What changes |
|---|---|---|
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The badge keys, the eight side names, and the six new log sentences (§3) |
| `src/i18n/catalog.test.ts` | modify | §4 |

## 3. Contract of the layer

### A. The rule of the badge

```ts
// frontend/src/game/coverBadge.ts

/** The eight sides of a cell, clockwise from the north edge of the map. */
export const COVER_SIDES = [
  'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest',
] as const;
export type CoverSide = (typeof COVER_SIDES)[number];

/** The sides of `position` that carry a cover prop, in `COVER_SIDES` order. Empty when none does. */
export function coverSides(board: Board, position: Position): CoverSide[];

/** The words written over the unit's head, in the player's language, or null for no badge. */
export function coverSentence(board: Board, position: Position): string | null;
```

- **The frame.** North is `(0, -1)`, east `(1, 0)`, south `(0, 1)`, west `(-1, 0)`, and the four
  diagonals between them; it is the board's own frame (m3-02, D1) and the camera never renames a side.
- **What counts.** Only a prop of kind `cover` (ADR 0012: a `wall` blocks sight and gives no cover).
  Only the eight neighbours — never the cell the unit stands on (ADR 0013) and never a prop two cells
  away.
- **Off the board.** `propAt` answers `undefined` outside, so a unit at the edge simply has fewer
  sides. The function never throws and never changes the board it reads.
- **The sentence.** `t('hud.cover.sides', { sides })` with the names joined by `t('hud.cover.and')`
  before the last (D3); `null` when no side carries cover.
- **The relation to the rule.** `coverFor` reads the same list from the other end: for an attacker at
  offset `p`, the shot is covered exactly when one of `coverSides` lies in that attacker's fan,
  `{d : d.x * p.x + d.y * p.y > 0}` — the three neighbours facing it — and is not the cell the
  attacker itself stands on. A test pins this (§4), so the badge cannot drift from the rule it
  describes (D1).

```ts
// frontend/src/game/highlightCovers.ts
export const HIGHLIGHT_COVERS_KEY = 'eldritch-alley.highlightCovers';
export const HIGHLIGHT_COVERS_DEFAULT = true;
export function readHighlightCovers(fallback?: boolean, storage?: KeyValueStorage | null): boolean;
export function saveHighlightCovers(enabled: boolean, storage?: KeyValueStorage | null): void;
```

A saved `'true'`/`'false'` wins; anything else, a missing entry, or storage that throws falls back to
the argument (the build's default), and `save` never throws.

```ts
// frontend/src/config.ts
export function highlightCoversDefault(env: BuildEnv): boolean;
```

`'1'`/`'true'` mean on, `'0'`/`'false'` mean off, an undeclared or empty value means
`HIGHLIGHT_COVERS_DEFAULT` (true), and anything else throws — the rule `gameServerEndpoint` already
follows, so a build with a typo fails at load instead of quietly shipping the wrong default (D4).

```ts
// frontend/src/scenes/map/MapView.ts
setMarksVisible(visible: boolean): void;

// frontend/src/scenes/units.ts
setCoverBadge(text: string | null): void;

// frontend/src/scenes/HudScene.ts
interface HudView { /* … */ highlightCovers: boolean; }
```

### B. The block of the log

```ts
// frontend/src/game/log.ts

/** What an event needs beyond itself: the board, and where every unit stands on it. */
export interface Battlefield {
  readonly board: Board;
  readonly positions: Readonly<Record<UnitId, Position>>;
}

export function describeEvent(event: Event, names: UnitNames, battlefield?: Battlefield): string;
```

The `attacked` branch asks two questions: whether the target was covered — `event.cover`, the engine's
own answer — and whether the shooter was, `coverFor(board, actorPosition, targetPosition)`, the same
rule read from the other end. Without a `battlefield` the second question is answered "no", so every
existing caller and test keeps working. The eight sentences:

| Key | pt-BR | en-US |
|---|---|---|
| `log.event.attacked` | `{actor} acertou {target} por {damage}` | `{actor} hit {target} for {damage}` |
| `log.event.missed` | `{actor} errou {target}` | `{actor} missed {target}` |
| `log.event.attackedCover` | `{actor} acertou {target} por {damage} em cobertura` | `{actor} hit {target} for {damage} in cover` |
| `log.event.missedCover` | `{actor} errou {target} em cobertura` | `{actor} missed {target} in cover` |
| `log.event.attackedFromCover` | `{actor}, em cobertura, acertou {target} por {damage}` | `{actor}, in cover, hit {target} for {damage}` |
| `log.event.missedFromCover` | `{actor}, em cobertura, errou {target}` | `{actor}, in cover, missed {target}` |
| `log.event.attackedBothCover` | `{actor}, em cobertura, acertou {target} por {damage}, que também estava em cobertura` | `{actor}, in cover, hit {target} for {damage}, who was in cover too` |
| `log.event.missedBothCover` | `{actor}, em cobertura, errou {target}, que também estava em cobertura` | `{actor}, in cover, missed {target}, who was in cover too` |

`log.event.missed` gains the target — today the line names only the shooter. `attackedCover` loses
"apesar da cobertura" for the owner's "em cobertura". The wording is D2 and D5.

### C. The badge's words

| Key | pt-BR | en-US |
|---|---|---|
| `hud.settings.highlightCovers` | `Realçar Coberturas` | `Highlight Covers` |
| `hud.cover.sides` | `Em cobertura a {sides}` | `In cover for {sides}` |
| `hud.cover.and` | ` e ` | ` and ` |
| `hud.cover.north` … `northwest` | `norte`, `nordeste`, `leste`, `sudeste`, `sul`, `sudoeste`, `oeste`, `noroeste` | `North`, `Northeast`, `East`, `Southeast`, `South`, `Southwest`, `West`, `Northwest` |

- **What this layer does not do.** It does not decide whether a shot is covered (the engine does),
  does not speak for one attacker (a badge lists every side that carries cover), does not hide the
  props themselves (only the diamonds), and does not change the map data or the protocol.
- **The badge is drawn, not carried.** The state hands the scene a position, the pure module turns it
  into words, and the sprite writes them: nothing of the sentence travels over the wire.

## 4. Tests planned

**Unit — `src/game/coverBadge.test.ts`:**

- [ ] No prop near the unit: `coverSides` is empty and `coverSentence` is `null`.
- [ ] One cover prop, one test per side, on each of the eight neighbours: exactly that side, named.
- [ ] Several cover props around one unit: all of them, in `COVER_SIDES` order whatever order the
  board lists them in.
- [ ] A `wall` prop beside the unit is not cover: no side, no sentence (ADR 0012).
- [ ] A cover prop two cells away is not cover.
- [ ] A cover prop under the unit itself is not cover (ADR 0013), though a prop beside it still is.
- [ ] A unit in a corner: the neighbours off the board are simply absent, and nothing throws.
- [ ] The sentence in pt-BR ("Em cobertura a leste") and in en-US ("In cover for East") through
  `setLocale`, the way `actions.test.ts` reads the copy.
- [ ] A unit covered on two sides reads both, joined by the catalog's conjunction.
- [ ] The property that ties the badge to the rule: for each of the eight cells around a target,
  `coverFor(board, target, attacker)` is true exactly when one of `coverSides` lies in that
  attacker's fan and is not the cell the attacker stands on.
- [ ] The board handed in comes back unchanged.

**Unit — `src/game/highlightCovers.test.ts`:**

- [ ] Empty storage: the fallback handed in; with none handed in, `HIGHLIGHT_COVERS_DEFAULT`.
- [ ] A saved `'true'` and a saved `'false'` are honoured; junk in the entry falls back.
- [ ] No storage at all (a browser that refuses it) and a storage that throws: the fallback, no throw.
- [ ] `save` writes `'true'` and `'false'`, and never throws.

**Unit — `src/game/log.test.ts`:** the four hit sentences and the four miss sentences, including
the target on a plain miss, the shooter in cover, both ends in cover, and no `battlefield` handed in
(the shooter's cover read as false).

**Unit — `src/config.test.ts`:** `VITE_HIGHLIGHT_COVERS` `'1'`/`'true'` → true, `'0'`/`'false'` →
false, undeclared and empty → the default, a junk value → throws.

**Unit — `src/i18n/catalog.test.ts`:** the two catalogs carry every new key with the same
placeholders, and every entry of `COVER_SIDES` has a name in both.

**Unit — `src/view/layout.test.ts`:** the third settings row sits between the pan row and the bottom
of the panel, inside it, and the panel still holds the three rows, above the dashboard and inside the
canvas.

**Unit — `src/view/theme.contrast.test.ts`:** the badge's fill and its stroke stay legible over the
lightest tile each of the three maps draws — the measure the paper marker already passes.

**Engine — `backend/engine/src/cover.test.ts`:** the prop under the target's own cell gives no cover,
from any of the eight directions; a prop beside it still does.

**Scene — `src/scenes/MatchScene.test.ts`:**

- [ ] A state whose unit stands beside a car hands that sprite the sentence (a spy on
  `UnitSprite.prototype.setCoverBadge`, since the stub swallows the `Text`).
- [ ] A defeated unit is handed `null`.
- [ ] A stored `'false'` is read at boot and reaches the map as `setMarksVisible(false)`, and the HUD
  is rendered with `highlightCovers: false`.
- [ ] A click inside `SETTINGS_COVERS_ROW_RECT` flips the value, saves it and calls
  `setMarksVisible` with the new one.

**E2E:** none. There is no HTTP surface and no new server behaviour to cover.

## 5. Dependencies

- m3-01 merged: the badge reads `state.board.props`, and the log's `cover` field, which only exist
  after it (`PROTOCOL_VERSION` 7, `bbd8865`).
- Nothing else. The compass is m3-02's, taken as the frame and not implemented here; the badge works
  today, with no facing in the game.

## 6. Decisions

- **D1. The sides are the props' sides, not the directions a shot comes from.** The owner chose
  detection by neighbourhood with every side named. A cover prop on the north cell reads "norte" even
  though the rule only rewards it against an attacker in the fan around that direction, and even
  though a prop under an enemy's feet counts for nobody. The readings coincide for the four straight
  sides and differ for the diagonals; the test in §4 states the relation exactly rather than leaving
  it to be found.
  - A. Name the side the cover stands on. **Recommended.**
  - B. Name the directions the unit is protected *from* (the union of the fans): every prop then names
    three sides and a unit beside one crate names three. Accurate as a rule, unreadable as text.
- **D2. The wording of the badge.** "Em cobertura a leste" / "In cover for East", from the owner's own
  example. The owner confirms the final Portuguese.
- **D3. Joining two sides.** A. `t('hud.cover.and')` before the last ("leste e norte").
  **Recommended**, it reads as language. B. Plain commas, one key fewer, reads as a list.
- **D4. A junk `VITE_HIGHLIGHT_COVERS`.** A. Throw at load, like `VITE_GAME_SERVER`. **Recommended**,
  the module's stated rule. B. Fall back to the default and say nothing.
- **D5. The eight log sentences.** A. Eight keys, each combination phrased on its own — including
  "que também estava em cobertura" when both ends are covered. **Recommended** for the reading; the
  owner confirms the wording and may trim the two "both" sentences if they read heavy in play.
  B. Four keys: the target's cover only, and the shooter's left unsaid.
- **D6. Hiding the marks repaints nothing.** Each mark gets a layer at `LAYER.highlight(cell)` and the
  toggle is a `setVisible` over them. A. A layer per mark. **Recommended**: ten-odd small canvases, no
  repaint, and `destroy` already walks every layer. B. Keep the diamond inside the cell's still canvas
  and rebuild the map on the toggle: less code, a visible hiccup on a click.
- **D7. The badge is drawn for both squads**, as the owner asked: the cover of an enemy is information
  the player may have.
- **D8. The ADR is new, not an edit.** `docs/adr/0013-no-cover-under-the-feet.md` supersedes
  ADR 0012 § D4. A. A new record. **Recommended** — the README's rule. B. Rewrite 0012 in place,
  which the same README forbids.

## 7. Out of scope

- Any other change to the rule of cover: `COVER_HIT_PENALTY` and the maps are as ADR 0012 left them,
  and a car and a crate stay walkable cells.
- Facing, direction bonus and height advantage (m3-02). The badge names board sides and is not tied
  to the facing arrow.
- Turning the props themselves off, or a legend of the map's vocabulary: this plan switches off the
  debug diamonds only.
- A badge for a wall (a wall is not cover) or for a unit that has already been defeated.

## 8. Commit split proposed

Three subjects, three commits, in this order (the rule first, so the client is built on it):

1. `fix(engine): a prop under the feet gives no cover` — `backend/engine/src/cover.ts`,
   `cover.test.ts`, `docs/adr/0013-*.md`, `docs/adr/README.md`.
2. `feat(frontend): mark the unit in cover and make the board marks a setting` — the badge, the
   setting, the config default, the HUD row, the layout, the map layers, the sprite, the scene, the
   badge's catalog keys.
3. `feat(frontend): name cover in the battle log` — `src/game/log.ts`, `log.test.ts`, the log
   sentences in both catalogs.
