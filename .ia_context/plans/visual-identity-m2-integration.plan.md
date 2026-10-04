# Plan — Visual identity, M2: integration (fonts, sprites, persistent units, animations, effects)

**Milestone:** m2-integration
**Parent feature:** [visual-identity.index.md](./visual-identity.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Draw the units as the prototype does and animate them: load the self-hosted fonts and the pixel-art
spritesheets, keep one persistent sprite per unit for the whole match, play the walk, idle, attack,
reload and meditation actions from the events the server sends, and draw the combat effects. The
decisions are in the M1 modules and in a new pure `presentation.ts`; the scene only plays what they
return. The chrome (HUD frames, buttons, lobby, legend) is **not** restyled here; that is M3.

Contract exposed to M3: `TEAM_COLOR`, `TEXT_COLOR` and the fonts are already applied to the chrome by
M1; M2 exposes `UnitSprite` and `playEffect`, which M3 does not change.

### 2. Prerequisites

- `visual-identity-m1-logic` approved and merged: `theme.ts`, `unit-look.ts`, `animation.ts`,
  `effects.ts`, `contrast.ts` exist and pass their tests.
- Font files and their licence texts, obtained by the executor from the official sources (Google
  Fonts download page for Special Elite (Apache 2.0) and IBM Plex Mono (SIL OFL 1.1)). If the executor
  has no network access, the owner provides the `.woff2` files. Do not fetch them from a CDN at runtime.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/public/sprites/spritesheet-ally.png` | create (copy) | Copy of `.ia_context/prototypes/eldritch-alley-characters-v1/assets/spritesheet-ally.png` (160×168, 1x only) |
| `frontend/public/sprites/spritesheet-enemy.png` | create (copy) | Copy of `…/spritesheet-enemy.png` (160×168, 1x only) |
| `frontend/public/fonts/SpecialElite-Regular.woff2` | create | Title font. Licence text in `frontend/public/fonts/LICENSE-SpecialElite.txt` |
| `frontend/public/fonts/IBMPlexMono-Regular.woff2` | create | Body font, weight 400. Licence in `LICENSE-IBMPlexMono.txt` |
| `frontend/public/fonts/IBMPlexMono-SemiBold.woff2` | create | Body font, weight 600 (used by the prototype for headings) |
| `frontend/index.html` | modify | `@font-face` for the three files (`font-display: block`), and body background `#0b0e18` |
| `frontend/src/main.ts` | modify | `pixelArt: true`; `backgroundColor` from `cssColor(BG_COLOR)` |
| `frontend/src/scenes/BootScene.ts` | modify | Preloads the two spritesheets; waits for the fonts (max 2000 ms, never blocks); creates the animations; keeps the 1000 ms hand-over to the lobby |
| `frontend/src/game/presentation.ts` | create | Pure: turns one `Event` into a list of cues the scene plays (section 4.2) |
| `frontend/src/game/presentation.test.ts` | create | Covers every event type |
| `frontend/src/scenes/units.ts` | create | `UnitSprite`: one container per unit (ground marker, sprite, selection ring, health bar, pips, corpse state) and its timed actions |
| `frontend/src/scenes/effects.ts` | create | `playEffect(scene, effect, from, to)`: draws and removes the effect kinds from `EFFECTS` |
| `frontend/src/scenes/MatchScene.ts` | modify | Persistent sprites instead of `removeAll`; plays cues from `presentationOf`; `update()` ticks the sprites |
| `frontend/src/view/theme.ts`, `grid.ts`, widgets, LobbyScene | **unchanged** | M3 owns them |

### 4. Contracts

#### 4.1 Asset and font loading

- `BootScene.preload()`: `this.load.spritesheet('unit-ally', 'sprites/spritesheet-ally.png', { frameWidth: 16, frameHeight: 24 })` and the same for `unit-enemy` from `spritesheet-enemy.png`. Paths are relative to the Vite base (`public/`).
- `BootScene.create()`: `await` `document.fonts.load('32px "Special Elite"')` and `document.fonts.load('18px "IBM Plex Mono"')`, raced against a 2000 ms timeout. Either failing or timing out must not stop the scene: wrap in try/catch and continue. Then create the animations (4.3). Then keep the existing `delayedCall(1000)` hand-over.
- The title of `BootScene` stays on `FONT` (body) until M3. Do not change any text style in this milestone.

#### 4.2 Presentation cues (`presentation.ts`)

```ts
export type Cue =
  | { kind: 'move'; unitId: string; from: Position; to: Position }
  | { kind: 'attack'; actorId: string; targetId: string; style: 'melee' | 'ranged'; hit: boolean; effect: Effect }
  | { kind: 'reload'; unitId: string; from: number; to: number }
  | { kind: 'defeat'; unitId: string }
  | { kind: 'remove'; unitId: string };

export interface Snapshot { position: Position; primaryClass: string; magazine: number | null }

export function presentationOf(event: Event, units: ReadonlyMap<string, Snapshot>): Cue[];
```

Rules:

- `moved` → one `move` cue with `from` and `to` from the event.
- `attacked` → one `attack` cue. `style` is `attackStyle(actor.position, target.position)` from `effects.ts`. `effect` is `EFFECTS[actor.primaryClass][style]`. If the actor's class has no entry, the cue is `[]` (nothing is played, the log still shows the event). `hit` is copied from the event.
- `reloaded` → one `reload` cue with `from: 0`, `to: magazine` of the actor. If `magazine` is `null`, `[]`.
- `unit-defeated` → one `defeat` cue.
- `corpse-removed` → one `remove` cue.
- `turn-ended` → `[]`.
- Unknown actor or target id → `[]`, never throws.

The function never changes `units`. The scene updates its own snapshot from the events it has played.

#### 4.3 Animations (Phaser keys, created once in `BootScene`)

For each sheet (`ally`, `enemy`) and each class row used (`sniper` 3, `wizard` 4, `priest` 5), frame indexes come from `frameIndex(row, column)` in `unit-look.ts`:

- `${sheet}-${class}-idle`: frames `[idle1, idle2]`, driven by `idleFrame`, not by a Phaser anim.
- Only frame numbers are stored; the sprite picks a frame with `setFrame` on each `tick`.
- A class without a row (`classRow` null) falls back to row 0 (Combatant). No error, no placeholder shape.

#### 4.4 `UnitSprite` (`scenes/units.ts`)

`UnitSprite extends Phaser.GameObjects.Container`. Members:

- **Ground marker:** a diamond `Graphics` of 36 px wide centred on the tile, filled `TEAM_COLOR[team]`, stroked 1 px `PAPER_COLOR`. If `markerStyle(team).corners`, four 4 px squares at the diamond's corners in `TEAM_COLOR.B` with a paper stroke. Corner squares are the non-colour cue for the bot's side.
- **Body:** a `Phaser.GameObjects.Sprite` on `unit-<sheet>` at scale 2, origin `(0.5, 1)`, feet on the diamond's centre. `setFlipX(team === 'B')`, so each team faces the other at match start.
- **Selection:** a 3 px `SELECTED_COLOR` diamond stroke, shown while the unit is selected.
- **Health bar:** 32×4 px above the head. Track `PANEL_STROKE`, fill `TEAM_COLOR[team]` at `healthFraction(unit)`.
- **Pips:** only when `pipsFor(unit)` is not `null`. Squares of 4 px with a 3 px gap above the health bar. Filled `WARM_COLOR`, empty `PANEL_STROKE`.
- **Corpse:** `defeated` → body tinted `CORPSE_COLOR`, a 2 px `CORPSE_OUTLINE_COLOR` diamond, no pips, no health bar. A corpse stays on its tile until `remove`.

Methods:

- `sync(unit: UnitState, selected: boolean, cellPixel: Pixel)`: updates the visuals. A unit that is mid-move is not snapped to `cellPixel`; the snap happens when its move ends.
- `moveTo(from: Pixel, to: Pixel)`: a Phaser tween of `movementDuration(cells)` ms, `walkFrame` applied each `tick`. `cells` is the Chebyshev distance.
- `playAttack(style, now)`: schedules by `ATTACK_TIMELINE`. The frame comes from `attackFrame(elapsed)` (melee uses columns 4/5, ranged uses 6/7). At `travelStart` for ranged, the scene calls `playEffect`. At the impact time (travel end, 260 ms long), a hit calls `flash()`: tint white for 260 ms and a 1 px horizontal shake.
- `playReload(from, to, now)`: frames from `reloadFrame(elapsed)` (columns 8/9). The pips show `filledPipsAt(elapsed, from, to)`. The Sniper's bolt click at 1180 ms is not played: there is no audio in the client (section 9).
- `tick(now)`: called from `MatchScene.update()`. Advances the active action and the idle or walk frame.

The timing of every action is in `animation.ts`. The sprite keeps the start time of its current action.

#### 4.5 Effects (`scenes/effects.ts`)

`playEffect(scene, effect, from: Pixel, to: Pixel)`, with the cell centres of the actor and target. Each `kind` draws with Phaser `Graphics` and removes itself on completion:

| `kind` | Drawing | Duration |
|---|---|---|
| `pistol-flash` | A 6 px flash at the actor's side of the tile, `effect.color` | 80 ms |
| `tracer` | A line from `from` to `to`, `effect.color`, fading out | `effect.travelMs` |
| `gust` | Three arcs of `PAPER_COLOR` at alpha 0.5 beside the actor | 300 ms |
| `missiles` | Three 4 px dots of `effect.color` on quadratic curves; dot `i` starts `i * effect.staggerMs` late | `effect.travelMs + 2 * staggerMs` |
| `glow-impact` | A 16 px `effect.color` flash on the target | 260 ms |
| `sky-column` | A 10 px wide `effect.color` column from the top of the target's tile to 40 px above it, then fades | `effect.travelMs` |

Impact particles: at the end of the travel, four 3 px squares of the target's `effect.color` scatter outward for 260 ms. Every effect is destroyed when done, so no object outlives its action.

#### 4.6 `MatchScene` changes

- `private sprites = new Map<string, UnitSprite>()`. `redrawUnits(state)` creates missing sprites, calls `sync` on the rest, and destroys the sprite of any unit no longer in `state.units`. It does not call `removeAll`.
- `handleEvents(events)`: for each event, `presentationOf(event, this.snapshot)`, play each cue, then update `this.snapshot` (move: new position; remove: deleted), then `appendLog` as before. The log text does not change.
- `update(_time, delta)`: calls `tick(this.time.now)` on every sprite.
- Clicks keep working during animations. The presentation never changes `this.state`, `this.mode` or the selection.
- The state message still arrives after its events, and it always has the last word on positions: a state for a unit that is not mid-move snaps it to its cell.

### 5. Tests planned

**`presentation.test.ts`** (Node):
- [ ] `moved` → one `move` cue with the event's `from` and `to`.
- [ ] `attacked` with the actor at `{0,0}` and target at `{1,1}` → `style: 'melee'`, `effect` equal to `EFFECTS.sniper.melee`.
- [ ] `attacked` with the target at `{4,0}` → `style: 'ranged'`, `effect.kind === 'tracer'` for a sniper.
- [ ] `attacked` with `hit: false` → `hit` is `false` in the cue.
- [ ] `attacked` with an actor class missing from `EFFECTS` (`'soldier'`) → `[]`.
- [ ] `reloaded` for a sniper with `magazine: 3` → `{ kind: 'reload', from: 0, to: 3 }`; for a wizard (`magazine: null`) → `[]`.
- [ ] `unit-defeated` → `defeat`; `corpse-removed` → `remove`; `turn-ended` → `[]`.
- [ ] An event whose actor or target id is not in the snapshot → `[]`, no throw.
- [ ] `presentationOf` does not mutate the snapshot map (deep-equal before and after).

**Automated checks run by the executor:**
- [ ] `npm test -w @eldritch-alley/frontend` passes.
- [ ] `npm run build -w @eldritch-alley/frontend` passes (`tsc --noEmit` and `vite build`).

**Manual (owner, in a browser at 1280×720, with the game server running):**
- [ ] The title and the body text load in the right fonts: no fallback monospace visible in the lobby or in the match (inspect with the browser's font panel, or with DevTools Network: both `.woff2` load).
- [ ] Turning off the network and reloading still renders the page (fallback font), and the match still plays.
- [ ] Each unit on the board is a pixel sprite of its class, facing the other team, with a diamond on the ground. Bot units have the corner squares.
- [ ] The sniper's reload plays: the pips start empty and refill one every 140 ms from 760 ms into the action.
- [ ] A melee attack from an adjacent unit plays the melee frames; an attack from two or more cells away plays the ranged frames and the tracer or missile effect.
- [ ] A hit flashes the target white and shakes it by 1 px; a miss plays no flash.
- [ ] A unit that falls turns grey with a paper outline and stays on its tile; it disappears from the board after the server removes its corpse.
- [ ] Clicking during an animation still selects and sends actions.
- [ ] A unit moved by the bot slides across the cells, not teleports.

### 6. Dependencies

- M1 approved.
- M3 depends on this milestone being approved.

### 7. Execution steps

1. Copy the two spritesheets into `frontend/public/sprites/`. Add the three font files and their licence texts to `frontend/public/fonts/`.
2. `index.html`: add the `@font-face` rules and the body background. `main.ts`: `pixelArt: true` and the background.
3. `BootScene`: preload, font wait, animations.
4. `presentation.ts` and its test (TDD: write the tests first, see them fail, then implement).
5. `effects.ts` and `units.ts`.
6. `MatchScene`: replace `redrawUnits` and `drawGrid`'s unit part; add `handleEvents`, `update`.
7. Run both automated checks. Then the manual list, in the order written.
8. Record the manual results in the PR, with a screenshot of the match mid-attack and one of a corpse.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Every manual item in section 5 is ticked by the owner in the PR.
- [ ] The grid, the carousel, the buttons and the legend look as they did after M1 (no chrome change in this milestone).
- [ ] No `console.log` in the new files.
- [ ] No `removeAll` left in `redrawUnits`.

### 9. Out of scope

- Restyling the HUD, the buttons, the lobby, the legend and the result line (M3).
- Recolouring the height tiles (M3).
- Sounds, including the sniper's bolt click (there is no audio in the client yet).
- The mana resource and its pips: the engine has no mana (ADR 0002), so wizard and priest show no pips.
- The back views of the sprites and the `@4x` sheets (review only, not shipped).
- The Street Vendor, Initiate, Adept and Combatant rows: they exist in the sheet but no class in the roster uses them.
- Phaser e2e tests: the frontend has no browser-test harness. Verification is the manual list above.
