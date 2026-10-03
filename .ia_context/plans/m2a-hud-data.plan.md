# Plan — M2-a HUD data: max health, protocol v2 and the pure view-models

**Milestone:** m2a-hud-data
**Parent:** [m2a-hud.index.md](m2a-hud.index.md)
**Created on:** 2026-10-03
**Status:** pendente

---

### 1. Objective

Everything the new HUD needs that can be computed and tested without a browser: a maximum health on
the unit state, a bumped protocol, and the four pure modules the carousel, the action bar and the
status panel read. No Phaser, no scene, no drawing.

### 2. Prerequisites

- `m2a-integration` approved and merged: the scenes, the protocol mirror and the net session exist.
- No engine change is required from any earlier plan; this is the first plan to touch `UnitState`.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `backend/engine/src/types.ts` | modify | `UnitState` gains `maxHealth: number`. `Unit` is **not** changed |
| `backend/engine/src/match.ts` | modify | `toUnitState` sets `maxHealth: unit.health` |
| `backend/engine/src/match.test.ts` | modify | A new match gives every unit `maxHealth === health` |
| `backend/engine/src/actions.test.ts` | modify | Damage lowers `health` and leaves `maxHealth` alone |
| `backend/engine/src/hash.test.ts` | modify | Changing only `maxHealth` changes the hash |
| `backend/engine/src/properties.test.ts` | modify | `maxHealth` is an integer; `health <= maxHealth` always |
| `backend/game-server/src/protocol.ts` | modify | `PROTOCOL_VERSION` 1 → 2, with the reason in the comment |
| `backend/game-server/src/map.ts` | modify | Delete `MAX_HEALTH_BY_UNIT_ID` and its import in `bot.ts` |
| `backend/game-server/src/bot.ts` | modify | Reads `actor.maxHealth` instead of the deleted map |
| `backend/game-server/src/battle-room.test.ts` | modify | The state message carries a `maxHealth` on every unit |
| `frontend/src/protocol.ts` | modify | `UnitState` gains `maxHealth`; `PROTOCOL_VERSION` → 2 |
| `frontend/src/game/selection.test.ts` | modify | The unit fixture gains `maxHealth` |
| `frontend/src/game/turn-order.ts` | create | `turnOrder(state): TurnSlot[]` |
| `frontend/src/game/turn-order.test.ts` | create | Tests for the above |
| `frontend/src/game/actions.ts` | create | `ActionMode`, `ActionButton`, `actionButtons`, `settleMode`, `applyMode` |
| `frontend/src/game/actions.test.ts` | create | Tests for the above |
| `frontend/src/game/highlight.ts` | create | `highlightedCells(input): Cell[]` |
| `frontend/src/game/highlight.test.ts` | create | Tests for the above |
| `frontend/src/game/panel.ts` | create | `PanelRow`, `unitPanel(state, unitId)` |
| `frontend/src/game/panel.test.ts` | create | Tests for the above |
| `frontend/src/game/log.ts` | modify | Add `describeRejection(reason): string` |
| `frontend/src/game/log.test.ts` | modify | Tests for the above |

### 4. Contracts

#### 4.1 Maximum health

The setup's `health` **is** the ceiling. `Unit` (`types.ts:46`) is untouched, so there is no second
field to keep in step, and `toUnitState` (`match.ts:147`) is the single point where the ceiling is
captured:

```ts
export interface UnitState extends Unit {
  /** HP the unit entered the match with. The ceiling for `health`; no M2-a rule raises it. */
  maxHealth: number;
  defeated: boolean;
  // ...
}
```

`health` then falls under damage (`events.ts:31`) and never rises above `maxHealth`; M2-a has no
healing. `newMatch` is unchanged, `publicState` and `hashState` carry the field automatically, and
`index.ts` needs no new export.

`hashState` canonicalizes the whole state, so **every state hash value changes**. Nothing pins one:
`hash.test.ts` and `events.test.ts` compare live hashes with each other, and the only literal vectors
in `hash.test.ts` are `fnv1a` over strings.

`MAX_HEALTH_BY_UNIT_ID` (`map.ts:119`) becomes a second source of truth for the same number and is
deleted; `bot.ts:73` becomes `actor.health * 2 < actor.maxHealth`. Behaviour is identical because
`maxHealth` equals the roster's `health`.

#### 4.2 Protocol

`PROTOCOL_VERSION` goes to **2** in both mirrors. Both headers already mandate it ("Bumped whenever a
payload changes shape") and the unit objects on the wire gain a field. The frontend mirror also
gains `maxHealth: number` on its `UnitState`. The engine's `PublicState` carries it by type, so the
server protocol needs no shape change beyond the version.

The client's guard is what makes the bump meaningful: `MatchScene.handleState` refuses a state whose
`version` differs from its own, so a v1 client meeting a v2 server shows "Versão incompatível" rather
than drawing a unit with no health ceiling.

#### 4.3 The mode narrows; it never invents

```ts
export type ActionMode = 'inspect' | 'move' | 'attack';

/** Keeps only the intents the armed mode allows. A mode narrows, it never invents. */
export function applyMode(mode: ActionMode, intent: Intent): Intent;
```

- `inspect` (default): identity — today's behaviour, unchanged.
- `move`: keeps `select` and a `send` whose action is `move`; everything else becomes `none`.
- `attack`: keeps `select` and a `send` whose action is `attack`; everything else becomes `none`.

`frontend/src/game/selection.ts` is therefore **not modified at all**: it stays the only place that
knows the click rules, and `applyMode` only ever removes. `reload` and `endTurn` never pass through
it — they have no board target and are sent straight from the button.

#### 4.4 Mode lifetime

```ts
export interface AvailableActions {
  canMove: boolean;
  canAttack: boolean;
  canReload: boolean;
  canEndTurn: boolean;
}

/** Whether the mode still makes sense for the unit that now has the turn. */
export function settleMode(mode: ActionMode, available: AvailableActions): ActionMode;
```

`move` survives while `canMove`, `attack` survives while `canAttack`, otherwise the mode returns to
`inspect`. One rule covers every case: a spent action clears all availability at once, so the bar and
the armed mode fall back together. Movement is repeatable until `movementLeft` runs out, so the mode
deliberately persists across consecutive moves. A **rejection does not clear the mode** — it changed
no state, and the player retries.

#### 4.5 The action bar

```ts
export interface ActionButton {
  id: 'move' | 'attack' | 'reload' | 'endTurn';
  /** Player-facing, Portuguese, owned here exactly as `log.ts` owns its sentences. */
  label: string;
  enabled: boolean;
  /** The mode this button arms, or null for a button that sends at once. */
  mode: ActionMode | null;
}

export function actionButtons(state: PublicState, humanTeam: Team): ActionButton[];
```

Labels: `Mover`, `Atacar`, `Recarregar`, `Terminar turno`. Enabled flags mirror the engine's own
guards and are **hints for the pointer** — the server still refuses anything illegal:

| Button | Enabled when |
|---|---|
| `Mover` | human's turn, `movementLeft > 0`, `!hasActed` |
| `Atacar` | human's turn, `!hasActed`, at least one living enemy within reach |
| `Recarregar` | human's turn, `!hasActed`, `magazine !== null`, `ammo < magazine` |
| `Terminar turno` | human's turn |

#### 4.6 The highlight is derived, not duplicated

```ts
export function highlightedCells(input: {
  state: PublicState;
  selectedId: string | null;
  mode: ActionMode;
  humanTeam: Team;
}): Cell[];
```

It walks the board, calls `resolveClick` on every cell, and keeps the cells whose intent is a `send`
of the armed kind. `inspect` returns `[]`. The highlight therefore agrees with the click **by
construction** rather than by discipline, and the frontend does not gain a second copy of the
engine's legality rules.

Because `resolveClick` only emits single-step moves (`selection.ts:55`), the move highlight is the
up-to-four neighbours, not the whole movement range — which is exactly what the client is able to
send.

#### 4.7 The panel

```ts
export interface PanelRow {
  key: 'hp' | 'movement' | 'action' | 'ammo' | 'reaction' | 'mana';
  label: string;
  value: string;
  /** Fraction of the row's bar to fill, 0..1, or null when the row has no bar. */
  fill: number | null;
  /** False for a row the engine cannot answer yet: drawn dimmed, never a control. */
  enabled: boolean;
}

export function unitPanel(state: PublicState, unitId: UnitId | null): PanelRow[];
```

Rows, in order:

| Key | Label | Value | en |
|---|---|---|---|
| `hp` | `HP` | `health/maxHealth` | yes |
| `movement` | `Movimento` | `movementLeft/movement`, or `—` for a unit that is not the actor | yes |
| `action` | `Ação` | `Disponível` / `Gasta`, or `—` for a unit that is not the actor | yes |
| `ammo` | `Munição` | `ammo/magazine`, or `—` when `magazine === null` | yes |
| `reaction` | `Reação` | `—` | **no** |
| `mana` | `Mana` | `—` | **no** |

`movementLeft` and `hasActed` are **match-level scalars describing only the unit at
`initiative[currentIndex]`** (`types.ts:101-108`) — they are not per-unit fields, hence the `—` for
any other unit rather than a misleading number. The two disabled rows cite ADR 0002 (mana arrives
with abilities, M3) and ADR 0007 (reaction slots derive from Nerve, M3) in a comment, so the `—` is
never mistaken for a zero.

#### 4.8 Rejection sentences

`describeRejection(reason: RejectReason): string` is added to `game/log.ts`, beside `describeEvent`,
because that file already declares itself the one place "the language lives". An exhaustive `switch`
over all 12 reasons, so a new reason becomes a compile error. Without it the new buttons would show
raw enum strings such as `not-enough-movement` to a Portuguese-speaking player.

### 5. Tests planned

**Automated** — `npm test -w @eldritch-alley/engine`, `-w @eldritch-alley/game-server`,
`-w @eldritch-alley/frontend`. No manual test in this plan; nothing here is drawn.

- [ ] `turn-order.test.ts`: the first slot is the unit at `initiative[currentIndex]`; rotation is
      correct and wraps at the head, middle and tail; it is stable when `currentIndex` is 0; the
      queue shrinks when a unit is defeated; an empty queue returns `[]`.
- [ ] `actions.test.ts`: `actionButtons` covers each axis independently — not the human's turn (all
      four disabled), `hasActed` (move/attack/reload disabled, `endTurn` still enabled),
      `movementLeft === 0`, a full magazine, `magazine === null` (no reload offered), no enemy in
      reach, no enemy left at all. `settleMode` keeps an available mode and drops an unavailable one.
      `applyMode` is identity for `inspect`, keeps `select` in both armed modes, keeps only the
      matching `send`, and turns the other `send` into `none`.
- [ ] `highlight.test.ts`: `[]` for `inspect`; `[]` when it is not the human's turn; `[]` when
      nothing is selected; exactly the four neighbours of an isolated unit in `move`; an occupied
      neighbour is excluded; only in-reach enemies in `attack`; out-of-bounds cells are never
      returned. The important one: **every returned cell produces a `send` intent when fed back
      through `resolveClick`**.
- [ ] `panel.test.ts`: the six rows in order with the right keys; `health/maxHealth` with a matching
      `fill`; `—` for movement and action on a unit that is not the actor; `—` for a class with no
      magazine; **`Reação` and `Mana` exist with `enabled: false`**; a null `unitId` returns `[]`.
- [ ] `log.test.ts`: `describeRejection` answers a non-empty sentence for all 12 `RejectReason`
      values, and no two reasons share a sentence.
- [ ] `selection.test.ts`: unchanged behaviour — the fixture gains `maxHealth`, and every existing
      case stays green, which is the proof that `selection.ts` was not touched.

**Engine**

- [ ] `match.test.ts`: every unit starts with `maxHealth === health`, and it equals the health the
      setup declared.
- [ ] `actions.test.ts`: after an attack that lands, the target's `health` falls and its `maxHealth`
      does not change.
- [ ] `hash.test.ts`: two states identical except for one `maxHealth` hash differently.
- [ ] `properties.test.ts`: in the existing sweep, `maxHealth` is an integer and `health <= maxHealth`
      holds after every accepted action; the replay equality assertion still passes.

**Game server**

- [ ] `battle-room.test.ts`: the state message carries a `maxHealth` greater than zero on every unit.

### 6. Dependencies

- `m2a-integration` approved (the protocol mirror and the scenes exist).
- `m2a-hud-view` depends on this plan; nothing here depends on it.

### 7. Execution steps

1. RED — write the new test files and the new cases in the existing ones. Run each package's suite
   and confirm the failures are missing-module and missing-field errors, not syntax errors.
2. Engine: add `maxHealth` to `UnitState` and set it in `toUnitState`.
3. Server: bump `PROTOCOL_VERSION`, delete `MAX_HEALTH_BY_UNIT_ID`, point `bot.ts` at `maxHealth`.
4. Frontend protocol: bump `PROTOCOL_VERSION`, add `maxHealth` to the mirror, fix the
   `selection.test.ts` fixture.
5. Implement `turn-order.ts`, `actions.ts`, `highlight.ts`, `panel.ts` and `describeRejection`.
6. GREEN — run the three suites and confirm every test passes.
7. Refactor, then run the three suites again.

### 8. Acceptance

- [ ] The three suites pass; no pre-existing test was weakened or deleted.
- [ ] `backend/engine` imports nothing new — `forbidden.test.ts` still passes.
- [ ] `frontend/src/game/selection.ts` is unchanged (`git diff --stat` shows no entry for it).
- [ ] No file outside section 3 is modified.
- [ ] ADR 0005 holds: `maxHealth` is a copy of an already-validated integer, no float and no clock.

### 9. Out of scope

Drawing of any kind (that is `m2a-hud-view`); mana, reaction and ability rules (M3 — ADR 0002,
ADR 0007); the DT-24 fix (`selection.ts:21` does not ignore `permanentlyDead`) and the DT-25 fix
(the `move-preview` variant is declared and never returned) — the highlight inherits DT-24
deliberately, because it must agree with the click and not with the engine; an explicit
`Unit.maxHealth`, which only becomes necessary if a future milestone starts a unit wounded; a
server-sent legal-action list, which would remove the client-side mirror altogether but is an engine
and protocol change of its own.
