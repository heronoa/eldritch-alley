# Plan — Title screen, M2: integration (HTML title, canvas city, walkers, connection, lazy Phaser start)

**Milestone:** m2-integration
**Parent feature:** [title-screen.index.md](./title-screen.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Put the title on screen: an HTML page with a canvas behind it, drawing the isometric city from
`city-data.ts`, the seven walkers from the neutral sheet, their ambient actions and effects, and the
stamp. The call to action runs the connection through `connect-flow.ts`. When the connection succeeds,
the Phaser game is created and the match starts with that session, as the lobby does today. The
`LobbyScene` is removed.

### 2. Prerequisites

- `title-screen-m1-logic` approved and merged.
- Assets: `spritesheet-neutral.png` and `spritesheet-neutral-blink.png`, exported as described in 4.1.
  The executor exports them from the prototype's drawing code in a scratch directory outside the repo,
  then copies only the two PNG files into `frontend/public/sprites/`.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/public/sprites/spritesheet-neutral.png` | create | 160×168, the seven rows with the grey armband, blink off (4.1) |
| `frontend/public/sprites/spritesheet-neutral-blink.png` | create | Same sheet with the scope glint (row 3) and the amulet (row 6) lit. Used on the blink frames of 4.4 |
| `frontend/index.html` | modify | The title markup (4.2); the `<canvas id="title-city">`; the Phaser mount `<div id="game">` stays, hidden until the match starts |
| `frontend/src/title/title.css` | create | Styles of the title (section 4.2, values from M3) |
| `frontend/src/title/city-render.ts` | create | Canvas 2D drawing of the city, props, walkers, ambient effects (4.3). The only file in `title/` that touches the DOM canvas |
| `frontend/src/title/sheet.ts` | create | Loads the three sheets as `HTMLImageElement` and returns the 16×24 frame for `(sheet, row, column)`. Frame choice uses `frameIndex` from `unit-look.ts` |
| `frontend/src/title/title.ts` | create | Entry: wires the DOM (CTA, Enter, stamp, footer), the animation loop, `connect-flow.ts` and `Session` |
| `frontend/src/main.ts` | modify | Does not create the Phaser game at import time. Exports `startMatch(session)`, which creates the game with `scene: [BootScene, MatchScene]`, starting `boot` with `{ session }` |
| `frontend/src/scenes/BootScene.ts` | modify | Receives `{ session }`, loads the sprite sheets and fonts (as in the identity M2), then starts `match` with the same session. The title text and the 1 s delay are removed |
| `frontend/src/scenes/LobbyScene.ts` | **delete** | Replaced by `title/title.ts` |
| `frontend/src/scenes/MatchScene.ts` | unchanged | |

### 4. Contracts

#### 4.1 Neutral sheet export (executor, outside the repo)

- Run the prototype `eldritch-alley-title-screen/index.html` in a headless browser, read the sprite
  canvases the prototype generates with `sprite(key, anim, frame, face, t, mode)` for every class and
  animation used, and lay them out in the sheet order of the characters README (rows: Combatant,
  Initiate, Adept, Sniper, Wizard, Priest, Street Vendor; columns: idle 1, idle 2, walk 1, walk 2, melee
  1, melee 2, ranged 1, ranged 2, resource 1, resource 2).
- The grey armband is `#5c6175`, drawn by the prototype at `(3, 12)`, 2×2 px, on every frame. The
  prototype's armband uses `#5c6175` for every frame and only moves it one pixel on idle frame 2.
- Blink: the sniper's scope glint and the amulet of the Street Vendor are drawn lit in the blink sheet.
  Their positions are read from the prototype's drawing code, not guessed.
- Check: the exported sheet, scaled 4×, matches `screenshots/title-screen.png` for the walkers. The
  executor attaches the comparison in the PR.

#### 4.2 HTML structure (`index.html`, styles in `title.css`)

```html
<canvas id="title-city" aria-hidden="true"></canvas>
<div class="shade"></div>
<main class="title">
  <div>
    <p class="meta">SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001</p>
    <h1>Eldritch Alley</h1>
    <span class="stamp">TACTICS</span>
    <p class="tagline">…</p>
    <button class="cta" id="cta" type="button">Iniciar partida</button>
    <p class="hint">ou pressione Enter</p>
    <p class="alert" id="alert" role="status"></p>
  </div>
</main>
<div class="granted" id="granted" aria-live="polite">PARTIDA AUTORIZADA</div>
<footer><span>v0.1</span><span>Belém · madrugada</span></footer>
<div id="game" hidden></div>
```

The text comes from `copy.ts` (the HTML is written with the same strings; a test in M3 checks they
match).

- The `alert` element shows `UNAVAILABLE` on failure, and is cleared on retry.
- The `cta` button is `disabled` while `connecting`, and its label becomes `CTA_BUSY`.
- The `granted` element gets class `on` while the stamp is visible (per `stampAt`).

#### 4.3 Canvas city (`city-render.ts`)

- The city is drawn with the prototype's projection: `TW = 32`, `TH = 16`, `HZ = 8`, the origin
  `OX = round(Wd/2 - 32)`, `OY = round(Hd*0.7 - 15*TH/2 - 8)`, and the pixel scale
  `max(2, round(min(CW/520, CH/300)))` on a low-resolution offscreen canvas, scaled up with
  `imageSmoothingEnabled = false`. The offscreen canvas is re-sized when the viewport changes.
- Order: sky gradient, 70 stars that twinkle with `sin(time * 1.3 + i)`, the distant skyline with its
  lit windows (seeded `rnd(9)`), then the cells, props and walkers sorted by depth:
  cell depth `x + y`, walker depth `round(x) + round(y) + 0.5`, cells before walkers at equal depth.
- Cells: the same three-face iso block as the prototype, with the same palette per tile and the same
  windows, zebra stripes, lane marks and grass speckles, seeded by `rnd(x * 31 + y * 17 + 3)`.
- Props: lamps with radial warm light, cars (horizontal and vertical), trees with the prototype's
  circles, and the two leaks with neon particles (`#ff3df2`, `#3de9ff`). Leaks are the only neon.
- Walkers: the sprite frame from `sheet.ts`, drawn at `(cx - 8, fy - 22)` with the shadow ellipse
  `fillRect(cx - 5, fy - 1, 10, 3)` under it. The walk frame is `walkFrame(t)` from `animation.ts`. Idle
  frame is `idleFrame(t)`. The `face` decides `setFlipX`-style mirroring: the canvas `scale(-1, 1)` around
  the sprite.
- Ambient effects (`ambient.ts` data): under the walker for meditation (magic circle or light beam),
  over the walker for particles, the magazine drop of the reload, and the bottle of the throw.
- The loop is `requestAnimationFrame`. `dt = min(0.05, (now - last) / 1000)`. When the tab is hidden
  (`document.hidden`) the loop stops and restarts on `visibilitychange`.

#### 4.4 Walkers and blink

- Each frame: `stepWalker` for each walker with `dt` scaled by `motionPolicy(...).speed`. At speed `0`
  walkers stay at their start positions and no ambient starts.
- The sniper draws the blink sheet while `scopeGlintOn(now)`; the Street Vendor draws the blink sheet
  while `amuletBlinkOn(now)`. Both use the same frame indexes as the normal sheet.

#### 4.5 Connection (`title.ts`)

- `press` (click on `cta` or Enter on the window, ignoring repeat events): `next(flow, 'press', now)`.
  When the state becomes `connecting`, the title calls `new Session(endpoint)` and `await session.connect()`.
  Success → `next(..., 'connected')`. Exception → `next(..., 'failed')`.
- The endpoint is the same constant as the lobby: `import.meta.env.VITE_GAME_SERVER ?? 'ws://localhost:2567'`.
- A timer checks `canTransition(flow, now)` every frame. When true, the title calls
  `startMatch(session)` from `main.ts`, which hides the title (`title` element gets `hidden`) and shows
  `#game`.
- `failed`: the stamp is hidden, `alert` shows `UNAVAILABLE`, the button is enabled again.
- A session that is never handed over (failed case, or the page unloads) is closed with
  `session.close()` if the SDK provides it; if it does not, no call is made. Check the `Session` API
  before writing this line.

#### 4.6 `main.ts`

```ts
let game: Phaser.Game | null = null;
export function startMatch(session: Session): void {
  game = new Phaser.Game(CONFIG);
  game.scene.add('boot', BootScene, true, { session });
  game.scene.add('match', MatchScene, false);
  game.scene.add('hud', HudScene, false);
}
```

- The scenes are added here, not declared in the config. Phaser starts the first scene of the config
  itself, the moment the textures are ready, with an empty data object — and a scene whose start has
  already begun ignores the data of a second `start`. A `scene: [BootScene, …]` in the config
  therefore ran the boot without a session, and the match threw on the missing one (a black screen).
  Added from `startMatch`, while the game is still booting, the boot is started once, with the session.
- `hud` is added last, so the HUD draws over the map. The match starts it (`this.scene.launch('hud')`).
- `CONFIG` is the current game config (1280×720, `Scale.FIT`, `pixelArt: true`, background `BG_COLOR`),
  without `scene`.
- The Phaser game is created at most once. A second call while a game exists throws a `RangeError`.
- Call `startMatch` only from `title.ts`. No other import of `main.ts`.

### 5. Tests planned

Node tests cover the logic (M1). This milestone has no unit test of the DOM or the canvas, because the
repo has no DOM test environment. The checks are:

**Automated:**
- [ ] `npm test -w @eldritch-alley/frontend` passes, with the M1 tests and the existing ones.
- [ ] `npm run build -w @eldritch-alley/frontend` passes (`tsc --noEmit` and `vite build`).
- [ ] `LobbyScene.ts` no longer exists; `grep -rn "LobbyScene" frontend/src` returns nothing.

**Manual (owner, desktop 1440×860, server running):**
- [ ] The page opens on the title, with the city behind it; no black frame; the walkers move.
- [ ] Each of the seven classes appears, and its ambient action plays at its lap (reload for the sniper, meditation by the park for the wizard and the initiate, faith meditation for the priest and the adept, bottle for the vendor, a pause for the combatant).
- [ ] Walkers never draw in front of a building that should hide them (depth check on the lamps and the cars).
- [ ] Pressing "Iniciar partida" shows the stamp, and the match starts after the server confirms. Enter does the same.
- [ ] Pressing twice does not create a second connection (check the network tab).
- [ ] With the server stopped: the stamp goes, "Servidor indisponível" shows, the button works again after the server starts.
- [ ] The match after the title plays exactly as before this milestone (no change in the match scene).
- [ ] Hiding the tab stops the loop (CPU drops in the performance panel) and it resumes when the tab is shown.

### 6. Dependencies

- M1 approved.
- Identity M3 approved (fonts, tokens).
- M3 depends on this milestone being approved.

### 7. Execution steps

1. Export the two neutral sheets as in 4.1. Copy the PNGs. Attach the comparison.
2. `sheet.ts`, then `city-render.ts`, reading `city-data.ts` and the M1 modules.
3. `title.css` and the markup in `index.html`.
4. `title.ts`: DOM wiring, the loop, `connect-flow`, `startMatch`.
5. `main.ts` and `BootScene.ts`: lazy game, session hand-over.
6. Delete `LobbyScene.ts`.
7. Run the automated checks, then the manual list in order. Record the results in the PR.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] Every manual item ticked by the owner in the PR, with a screenshot of the title and one of the match.
- [ ] `backend/` unchanged.

### 9. Out of scope

- Team selection, matchmaking and any new server message.
- The mobile composition (M3).
- Reduced motion styling beyond the policy in M1 (M3 wires the CSS side).
- Sounds.
