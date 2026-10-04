# Plan — Title screen, M1: logic (city data, walkers, ambient schedule, stamp, connection)

**Milestone:** m1-logic
**Parent feature:** [title-screen.index.md](./title-screen.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Put every rule of the title screen into Phaser-free, DOM-free modules that Node can test: the frozen
city, the walker paths and their timing, the ambient action schedule, the stamp timeline, the connection
state machine and the copy. M2 draws these; M3 styles the page. Nothing visible changes in this
milestone.

Contract exposed to M2: the exports of section 3, with the values of section 4.

### 2. Prerequisites

- `visual-identity-m3-design` approved and merged. This milestone imports `view/unit-look.ts` and
  `view/animation.ts` from it.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/title/city-data.ts` | create | Literal data: the 16×16 tile rows, the 16×16 height rows, the props list (section 4.1). Generated once from the prototype's formula by a script kept **outside** the repo; the file header says where the numbers came from |
| `frontend/src/title/city-data.test.ts` | create | Shape, ranges and a checksum that the prototype formula produces the same data |
| `frontend/src/title/walkers.ts` | create | The seven walker paths, the speed, and the pure `stepWalker` (section 4.2) |
| `frontend/src/title/walkers.test.ts` | create | Movement, laps, ambient triggers, the 2.4 s stop, the injected random source |
| `frontend/src/title/ambient.ts` | create | The ambient action of each class, its duration and its frame timeline (section 4.3) |
| `frontend/src/title/ambient.test.ts` | create | Duration, frames, the fade in and out |
| `frontend/src/title/stamp.ts` | create | The stamp timeline: scale 1.6 → 1 and opacity over 180 ms, visible for 1600 ms (section 4.4) |
| `frontend/src/title/stamp.test.ts` | create | Each boundary |
| `frontend/src/title/connect-flow.ts` | create | Pure state machine for the call to action (section 4.5) |
| `frontend/src/title/connect-flow.test.ts` | create | Every transition, including failure and double press |
| `frontend/src/title/copy.ts` | create | The Portuguese strings of the title (section 4.6) |
| `frontend/src/title/copy.test.ts` | create | Non-empty strings, footer without the prototype's word |
| `frontend/src/title/motion.ts` | create | `motionPolicy(reduced: boolean)` (section 4.7) |
| `frontend/src/title/motion.test.ts` | create | Both policies |

Not touched: the scenes, `main.ts`, `index.html`, `backend/`.

### 4. Contracts and exact values

#### 4.1 City data (`city-data.ts`)

- `TILE_ROWS: readonly string[]`: 16 strings of 16 characters. Letters as the prototype: `B` building, `a` asphalt, `z` crosswalk, `s` sidewalk, `g` grass.
- `HEIGHT_ROWS: readonly number[][]`: 16×16, values `0..6`. Non-building cells are `0`.
- `PROPS: readonly Prop[]` with `Prop = { kind: 'lamp' | 'car' | 'tree' | 'leak'; x: number; y: number; color?: string; vertical?: boolean }`. Exactly the prototype's list: 8 lamps, 4 cars, 4 trees, 2 leaks.
- Generation rule (for the record, the script is not in the repo): tiles and heights come from the prototype's loop, with the same crossings, the same formula `(x * 73 + y * 151) % 17` for building heights, and the same square-of-low-buildings rule.
- Checksum test: the sum of all heights is the number the prototype's formula gives, and the number of `B` cells is the one the formula gives. The executor records both numbers in the test.

#### 4.2 Walkers (`walkers.ts`)

```ts
export type WalkerKey = 'sniper' | 'wizard' | 'priest' | 'initiate' | 'adept' | 'vendor' | 'combatant';
export interface Walker { key; points: Cell[]; segment: number; fraction: number; face: 1 | -1; state: 'walk' | 'act'; timer: number; laps: number; ambient: AmbientKind | null }
export const WALK_SPEED = 0.9; // cells per second
export const WALKERS: Record<WalkerKey, { points: Cell[]; offset: number; every: number; ambient: AmbientKind }>;
export function createWalker(key, random: () => number): Walker;
export function stepWalker(w: Walker, dt: number, random: () => number): Walker;
export function positionOf(w: Walker): { x: number; y: number };
```

Paths and timing, exactly as the prototype:

| Walker | Points | Offset | Ambient | Every N laps |
|---|---|---|---|---|
| sniper | `[7,5] [7,8] [10,8] [10,5]` | 0 | reload | 2 |
| wizard | `[7,8] [7,11] [3,11] [3,9] [7,9]` | 1.5 | meditate (arcane) | 1 |
| priest | `[10,5] [10,8] [13,8] [13,5]` | 0.6 | meditate (faith) | 2 |
| initiate | `[7,5] [3,5] [3,4] [7,4]` | 2.2 | meditate (arcane) | 2 |
| adept | `[7,5] [7,8] [10,8] [10,5]` | 2.4 | meditate (faith) | 3 |
| vendor | `[10,8] [10,12] [11,12] [11,8]` | 1 | throw | 2 |
| combatant | `[7,8] [10,8] [10,5] [7,5]` | 3.1 | idle | 3 |

Rules of `stepWalker`:

- While walking, `fraction += WALK_SPEED * dt / segmentLength`. When it reaches 1, the segment advances. When the segment index returns to `0`, `laps` increases.
- When the walker enters segment `0` and `laps % every === 0`, and the ambient is not `idle`, it switches to `act` with `timer = 0`.
- The combatant (`idle`) also has a chance to stop: on an odd segment, with `random() < 0.5`, it switches to `act`. Random is injected so tests can fix it.
- `face` is `1` when the segment's on-screen x delta is positive, otherwise `-1`. The on-screen delta is `(dx) - (dy)` as in the prototype.
- While in `act`, `timer += dt`. When `timer > 2.4`, the walker returns to `walk` and keeps its position.
- `dt` is clamped by the caller to `0.05` s, as the prototype does.

#### 4.3 Ambient actions (`ambient.ts`)

- `AMBIENT_DURATION_S = 2.4`.
- `AmbientKind = 'reload' | 'meditate-arcane' | 'meditate-faith' | 'throw' | 'idle'`.
- `ambientFrame(kind, timer): number | null`: the column of the sheet, 0..9, using the column table of `unit-look.ts` (`frameIndex(row, column)`):
  - `reload`: `timer < 0.3 || timer > 2` → `null` (the caller draws the idle frame); `timer < 1.1` → column 8; otherwise column 9.
  - `meditate-*`: `Math.floor(timer / 0.22) % 2` → column 8 or 9.
  - `throw`: `timer < 0.2 || timer > 1.4` → `null` (idle); `timer < 0.5` → column 6; otherwise column 7. Street Vendor, sheet row 6.
  - `idle`: `Math.floor(timer / 0.6) % 2` → column 0 or 1.
- `ambientFade(timer): number` = `min(1, timer / 0.3, (2.4 - timer) / 0.3)`, clamped to `0..1`. Used by effect alpha.
- `ambientEffect(kind): 'magic-circle' | 'light-beam' | 'reload-magazine' | 'bottle' | null`. Arcane → magic circle; faith → light beam; reload → magazine drops; throw → bottle; idle → null.
- `bottleAt(timer): {t: number} | null`: the bottle is in flight for `timer` in `0.5..1.1` (progress `(timer - 0.5) / 0.6`), shattering in `1.1..1.4` (progress `(timer - 1.1) / 0.3`). Outside those ranges, `null`.

Blink (the prototype's time-based glints): `scopeGlintOn(now: number): boolean` = `Math.floor(now / 0.9) % 4 === 0` (sniper). `amuletBlinkOn(now: number): boolean` = `Math.floor(now / 0.7) % 6 === 0` (vendor). `now` is in seconds.

#### 4.4 Stamp (`stamp.ts`)

- `STAMP_SLAM_MS = 180`, `STAMP_VISIBLE_MS = 1600`.
- `stampAt(elapsedMs: number): { scale: number; opacity: number; visible: boolean }`.
  - `elapsed < 0` → hidden.
  - `0 ≤ elapsed < 180` → `scale = 1.6 - 0.6 * (elapsed / 180)`, `opacity = elapsed / 180`, visible.
  - `180 ≤ elapsed < 1600` → `scale 1`, `opacity 1`, visible.
  - `1600 ≤ elapsed < 1780` → fade out: `opacity = 1 - (elapsed - 1600) / 180`, scale 1, visible.
  - otherwise hidden.
- Under `motionPolicy` reduced: `stampAt` is used with `scale` fixed at `1` and only the opacity changes over the same durations.

#### 4.5 Connection flow (`connect-flow.ts`)

```ts
export type FlowState = 'idle' | 'connecting' | 'ready' | 'failed';
export type FlowEvent = 'press' | 'connected' | 'failed';
export interface Flow { state: FlowState; stampStartedAt: number | null }
export function next(flow: Flow, event: FlowEvent, now: number): Flow;
export function canTransition(flow: Flow, now: number): boolean; // true when state is 'ready' and now - stampStartedAt >= 180
```

Rules:

- `idle` + `press` → `connecting`, `stampStartedAt = now`.
- `connecting` + `press` → unchanged (double press ignored).
- `connecting` + `connected` → `ready`.
- `connecting` + `failed` → `failed`, `stampStartedAt = null`.
- `failed` + `press` → `connecting` (retry).
- `ready` and `failed` ignore presses.
- `canTransition` is true when the state is `ready` and at least `180` ms have passed since `stampStartedAt`. Until then the scene waits, so the stamp always finishes its slam.

#### 4.6 Copy (`copy.ts`)

Portuguese, copied from the prototype, one export each:

- `META = 'SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001'`
- `TITLE = 'Eldritch Alley'`
- `STAMP_TAG = 'TACTICS'`
- `TAGLINE = 'Agentes licenciados, magia sem licença e uma cidade inteira de becos. Monte o seu esquadrão e responda à ocorrência.'`
- `CTA = 'Iniciar partida'`
- `CTA_BUSY = 'Conectando…'`
- `HINT = 'ou pressione Enter'`
- `GRANTED = 'PARTIDA AUTORIZADA'`
- `UNAVAILABLE = 'Servidor indisponível'`
- `FOOTER_VERSION = 'v0.1'`
- `FOOTER_PLACE = 'Belém · madrugada'`

#### 4.7 Motion (`motion.ts`)

```ts
export interface MotionPolicy { walkers: boolean; ambient: boolean; stampScale: boolean; speed: number }
export function motionPolicy(reduced: boolean): MotionPolicy;
```

- `reduced === false` → `{ walkers: true, ambient: true, stampScale: true, speed: 1 }`.
- `reduced === true` → `{ walkers: false, ambient: false, stampScale: false, speed: 0 }`. Walkers stay at their start points (`createWalker` offset positions) and draw as still frames.

### 5. Tests planned

**`city-data.test.ts`**
- [ ] 16 rows, each of 16 characters; every character is one of `B a z s g`.
- [ ] 16 rows of 16 numbers, each `0..6`; a non-building cell has height `0`.
- [ ] `PROPS` has 8 lamps, 4 cars, 4 trees, 2 leaks.
- [ ] Checksum: sum of heights and count of `B` equal the values recorded from the prototype formula.

**`walkers.test.ts`** (with `random = () => 0.9` and `() => 0.1`)
- [ ] A walker moves `0.9` cells per second along its segment: after `dt = 1 / 0.9` on a unit segment it reaches the next point.
- [ ] `laps` increases exactly once per full loop.
- [ ] The sniper enters `act` (`reload`) on the second lap (`every: 2`), not on the first.
- [ ] `act` lasts `2.4` s: at `timer = 2.39` still `act`, at `2.41` back to `walk`.
- [ ] The combatant enters `act` on an odd segment when `random() < 0.5` and never when `random() ≥ 0.5`.
- [ ] `face` is `1` moving right on screen and `-1` moving left.
- [ ] `stepWalker` does not mutate its input.

**`ambient.test.ts`**
- [ ] `ambientFrame('reload', t)` at `0.2` → idle; `0.5` → column 8; `1.5` → column 9; `2.5` → idle.
- [ ] `ambientFrame('meditate-arcane', 0.1)` → 8, `0.3` → 9.
- [ ] `ambientFrame('throw', 0.1)` → idle; `0.3` → 6; `0.8` → 7; `1.5` → idle.
- [ ] `ambientFade` at `0`, `0.15`, `1.2`, `2.4` → `0`, `0.5`, `1`, `0`.
- [ ] `bottleAt(0.4)` is `null`; `bottleAt(0.8)` has progress `0.5`; `bottleAt(1.2)` has progress `1/3`.
- [ ] `scopeGlintOn(0)` is `true`, `scopeGlintOn(0.9)` is `false`. `amuletBlinkOn(0)` is `true`, `amuletBlinkOn(0.7)` is `false`.

**`stamp.test.ts`**
- [ ] `stampAt(-1).visible` is `false`.
- [ ] `stampAt(0)`: scale `1.6`, opacity `0`, visible.
- [ ] `stampAt(180)`: scale `1`, opacity `1`.
- [ ] `stampAt(1600)`: opacity `1`; `stampAt(1690)`: opacity `0.5`; `stampAt(1780)`: hidden.
- [ ] Reduced policy: scale is `1` at every elapsed value.

**`connect-flow.test.ts`**
- [ ] `idle` + `press` → `connecting` with `stampStartedAt === now`.
- [ ] Second `press` while `connecting` returns the same state object.
- [ ] `connecting` + `connected` → `ready`; `connecting` + `failed` → `failed` with `stampStartedAt === null`.
- [ ] `failed` + `press` → `connecting` (retry works).
- [ ] `canTransition` is `false` for `ready` at 179 ms after the press and `true` at 180 ms.
- [ ] `canTransition` is `false` for `connecting` and `failed` at any time.

**`motion.test.ts`**
- [ ] `motionPolicy(false)` has all flags true and `speed === 1`.
- [ ] `motionPolicy(true)` has walkers, ambient and stampScale false, `speed === 0`.

**`copy.test.ts`**
- [ ] Every string is non-empty; `CTA` is `'Iniciar partida'`; `FOOTER_VERSION` contains no `protótipo`.

### 6. Dependencies

- `visual-identity-m3-design` approved.
- Downstream: M2 imports every export of this milestone.

### 7. Execution steps

1. Write the tests of each module first; run them, see them fail.
2. Generate `city-data.ts` once with a script outside the repo (scratch directory), and commit only the generated file.
3. Implement `walkers.ts`, `ambient.ts`, `stamp.ts`, `connect-flow.ts`, `copy.ts`, `motion.ts` to pass the tests.
4. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`.
5. Do not add any DOM, Phaser or `document` access in `frontend/src/title/`.

### 8. Acceptance

- [ ] All tests pass, including the checksum test.
- [ ] The build passes.
- [ ] `grep -rn "document\|window\|phaser" frontend/src/title/*.ts` finds nothing outside the test files.
- [ ] No file outside `frontend/src/title/` changed.

### 9. Out of scope

Drawing the city or the characters (M2). The page, CSS and typography (M3). Team selection and the roster of the match (a future feature). Mobile composition (M3).
