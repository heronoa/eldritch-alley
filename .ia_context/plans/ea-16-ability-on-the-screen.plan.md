# Plan — EA-16: the ability on the screen

**Milestone:** —
**Parent feature:** m3-rules-and-content — the owner's request while reviewing m3-03
**Requires:** m3-03 (abilities) approved; ADR 0016 accepted; ADR 0009 (client localization) and ADR 0011 (resource pools) in force
**Created:** 2026-10-08
**Status:** applied on 2026-10-08, awaiting review — both parts are written and green; the commit split of section 8 is proposed and uncommitted

---

## 0. Findings

What the owner saw while playing m3-03, and what the code says about it.

| What the owner said | What the code does today |
|---|---|
| "não dá pra selecionar qual spell usar" | `Habilidade` arms the mode directly (`MatchScene.pressAction`, `MatchScene.ts:711`), and `aimAbility` resolves the ability from `unit.abilities.activeSets[0]` alone (`selection.ts:90-94`). There is no list and no choice: the button arms the class's one ability. |
| "nem tem nenhum aviso de qual spell vai ser usado" | Nothing on the screen names the ability. The button says `Habilidade` (`action.ability`), the highlight paints the reach in the attack colour, and the cost is nowhere. |
| "que o log diga qual a habilidade usada" | `log.event.ability-used` is `'{actor} usou uma habilidade em {cell}'` (`catalog.pt-BR.ts:69`): the sentence names the cell and not the ability, though the event carries `abilityId` (`protocol.ts:253`). |
| "algum tipo de animação no lugar acertado" | `presentation.ts:92-95` returns `[]` for `ability-used`, `damaged` and `healed`: an ability plays nothing at all. Every attack effect is procedural (`scenes/effects.ts`: rectangles, graphics and tweens, self-destroying), and no fire or explosion asset exists — `frontend/public/` holds fonts and unit spritesheets only. |

Three facts constrain the design:

1. **`AbilityDefinition` has no name and cannot gain one.** ADR 0016 §13: "The engine never learns a class or an ability name… the words on the screen come from the catalogs (ADR 0009)". So the menu's name comes from the i18n catalogs, keyed by the engine's id.
2. **Only `activeSets[0]` is read.** ADR 0016 §6: the second active set, and the `reaction`, `movement` and `support` slots, "stay unread". A menu that offered them would offer the player an action the server answers with `ability-unknown` — rule 2 of `CLAUDE.md` forbids it, and EA-1 D1 wants the client to refuse exactly what the server refuses.
3. **The area the impact covers is the engine's own `abilityCells`** (ADR 0016 §11), already exported through the package entry and already used by the engine's resolution (`actions.ts:338`). Painting the cells the engine did not resolve would be a second, drifting rule.

The pure modules are where the choices get pinned: `game/` holds the tested rules and `scenes/HudScene.ts` only draws what it is handed. The Phaser stub in the scene tests swallows `Text`, so **the content of the menu has to be a pure module** — that is the EA-15 lesson, and it decides where Part A's data lives.

---

## 1. Objective

Make the ability legible: the player opens a menu that names what the class carries, what it costs and what it does, arms the one they choose, and reads the choice in the log and on the board when it lands.

Part A — the menu, the names, and the log line.
Part B — the impact: an animation per kind of effect, in the class's own colours.

The contract this milestone exposes to the next layer: a menu whose options come from the unit's own slots and the match's own catalog, an armed ability that is explicit state rather than "the one the class carries", and a cue the board can draw for a use that has no art yet.

---

## 2. Changes by layer

### Part A — the menu, the names, the log

| File | Operation | What changes |
|---|---|---|
| `frontend/src/i18n/catalog.pt-BR.ts` | modify | The names (`ability.piercing-shot` = `'Tiro Perfurante'`, `ability.fireball` = `'Bola de Fogo'`, `ability.area-heal` = `'Cura em Área'`), the fragments of the effect line (`ability.detail.damage`, `ability.detail.heal`, `ability.detail.radius`, `ability.detail.ignoresCover`, `ability.detail.hitsAllies`), and the named log line `log.event.ability-used-named` = `'{actor} usou {ability} em {cell}'`. |
| `frontend/src/i18n/catalog.en-US.ts` | modify | The same keys: `'Piercing Shot'`, `'Fireball'`, `'Area Heal'`, `'Damage {amount}'`, `'Heal {amount}'`, `'radius {radius}'`, `'ignores cover'`, `'hits everyone, allies included'`, `'{actor} used {ability} on {cell}'`. |
| `frontend/src/i18n/abilities.ts` | create | `abilityName(id)`: the catalog's word for an id this build knows, or `null`. One map from the engine's id to the message key, which is exactly the split ADR 0016 §13 and ADR 0009 draw. |
| `frontend/src/i18n/index.ts` | modify | Export `abilityName`, next to the rest of the module's surface. |
| `frontend/src/game/ability-menu.ts` | create | `abilityOptions(state, unit)`: the rows the menu shows, each with its name, its cost in the unit's own pool, the effect line, and whether the pool covers it. Pure, so the content of the modal is tested without a browser. |
| `frontend/src/game/actions.ts` | modify | The button's policy (D3): `canUseAbility` stops asking about the pool, so the menu can be opened by a unit that cannot pay and the cost can be read. |
| `frontend/src/game/selection.ts` | modify | `ClickInput` gains `abilityId`, and `aimAbility` resolves the chosen id in the catalog instead of always reading `activeSets[0]`. The carried ability stays the fallback, so a caller with no choice to make reads what it read before. |
| `frontend/src/game/highlight.ts` | modify | `HighlightInput` gains the same `abilityId`, `abilityReach` resolves it, and the answer cache is keyed by it. |
| `frontend/src/game/log.ts` | modify | The `ability-used` sentence names the ability, and falls back to the generic sentence for an id this build cannot name (D7). |
| `frontend/src/view/layout.ts` | modify | `ABILITY_MENU_RECT`, `ABILITY_MENU_ROW`, `ABILITY_MENU_CLOSE_RECT`, `abilityMenuRowRect(index)` and `abilityMenuRowIndexAt(point)`, in the style of the settings panel's rects. |
| `frontend/src/scenes/HudScene.ts` | modify | The panel, its rows and its close button, built once with the other overlays and shown only while it is open; the rows are redrawn from the view like the inspection's. |
| `frontend/src/scenes/MatchScene.ts` | modify | `menuOpen` and `armedAbilityId` as state; `Habilidade` opens the menu instead of arming; a pick arms; the menu is read first and swallows every press while it is open; the armed id reaches `resolveClick` and `drawHighlights`. |

### Part B — the impact

| File | Operation | What changes |
|---|---|---|
| `frontend/src/game/presentation.ts` | modify | A new `ability` cue, and the rule that picks its shape: a blast for a damage effect that covers a patch, the class's own shot for one that covers a single cell, a glow for a heal. The cells come from the engine's `abilityCells`. |
| `frontend/src/scenes/effects.ts` | modify | `playImpact`, and the three drawings behind it — the expanding ring, the per-cell flashes, the rising glow — built from the helpers already in the file (`flash`, `burst`) and self-destroying like the rest. |
| `frontend/src/scenes/MatchScene.ts` | modify | `play` gains the `ability` case: it turns the cue's cells into the points their top faces rest on and calls `playImpact`. |

No `AbilityDefinition` gains a field, no protocol version rises, and no new asset is added: the catalog already travels inside `state.catalog` (ADR 0016 §3), so the client can already resolve a definition and its cells.

---

## 3. Contract of the layer

### 3.1 The menu's content (`game/ability-menu.ts`, pure)

```ts
/** One row of the menu: what the ability is called, what it costs, and what it does. */
export interface AbilityOption {
  readonly id: string;
  /** The word the catalogs give the id, or the id's own fallback word when this build has none. */
  readonly name: string;
  /** The cost and the pool it is paid from: `'2 Energia'`, `'1 Munição'`. */
  readonly cost: string;
  /** The effect, in the player's words: `'Dano 6 · ignora cobertura'`, `'Cura 3 em raio 1'`. */
  readonly detail: string;
  /** Whether the unit's own pool covers the cost. A row the pool cannot pay is drawn dimmed. */
  readonly affordable: boolean;
}

/**
 * The rows the menu shows for a unit: the abilities its own slots name, resolved in the match's own
 * catalog (ADR 0016 §3, §6). Only the first active set is offered, because it is the only one the
 * engine reads — a row for a slot the server would refuse would be a lie on the screen.
 */
export function abilityOptions(state: PublicState, unit: UnitState): AbilityOption[];
```

- The cost's pool word is the unit's own kind, read the way the unit sheet reads it: `t('panel.label.energy')` for `mana`, `t('panel.label.ammo')` otherwise (`inspect-window.ts:43` is the precedent).
- The detail is composed from the effect, never from the name: `damage` → `ability.detail.damage` with `{amount}`; `radius > 0` → `ability.detail.radius` with `{radius}`; `ignoresCover` → `ability.detail.ignoresCover`; a damage effect with `radius > 0` also gets `ability.detail.hitsAllies`, because hurting allies is a rule the player has to know before aiming (ADR 0016 §12). The fragments are joined with `' · '`.
- A unit naming no ability, or naming one the catalog does not define, offers no rows: the menu opens on an empty list, which is the honest answer and the one case that cannot happen today (the button is only offered when the unit carries one).

### 3.2 The name (`i18n/abilities.ts`)

```ts
/** The catalog's word for an ability id, or null when this build has no word for it. */
export function abilityName(id: string): string | null;
```

`null` is not an error: the catalog travels with the match (ADR 0016 §3), so a server can ship an ability this build cannot name. Printing the raw id to the player would be worse than the generic sentence (D7).

### 3.3 The armed ability (`game/selection.ts`, `game/highlight.ts`)

```ts
export interface ClickInput {
  // …unchanged…
  /** The ability the bar armed, or null to read the one the unit carries (ADR 0016 §6). */
  abilityId?: string | null;
}

export interface HighlightInput {
  // …unchanged…
  abilityId?: string | null;
}
```

- With `abilityId` given, both resolve it through `abilityById(state.catalog, id)`; with it absent or `null`, both fall back to `activeSets[0]` exactly as they do today.
- An id the catalog does not define is refused with `ability-unknown`, which is the engine's own reason for the same case (ADR 0016 §7).
- `highlightedCells`' cache key gains the id, so two abilities on the same state are two answers and never one.

### 3.4 The impact (`game/presentation.ts`, pure)

```ts
/** What a use looks like where it lands, in the shapes the board can draw. */
export type AbilityImpact =
  /** A damage effect that covers a patch: the ring at the centre and a flash on every cell it covers. */
  | { style: 'blast'; cells: Position[]; color: number }
  /** A damage effect that covers one cell: the class's own shot, flown in, and a heavier landing. */
  | { style: 'shot'; to: Position; effect: Effect }
  /** A heal: the glow that rises over the cells it covers, in the class's own colour. */
  | { style: 'glow'; cells: Position[]; color: number };

export type Cue =
  // …unchanged…
  | { kind: 'ability'; actorId: string; cell: Position; impact: AbilityImpact };

export function presentationOf(
  event: Event,
  units: ReadonlyMap<string, Snapshot>,
  state?: PublicState,
): Cue[];
```

- The three shapes are chosen by the effect, not by the ability's name (the owner's "por tipo de efeito"): `heal` → `glow`; `damage` with `radius === 0` → `shot`; `damage` with `radius > 0` → `blast`.
- `cells` is the engine's own `abilityCells(state, event.to, definition)` — the same answer the highlight paints and the resolution reads, so the animation cannot mark a cell the engine did not resolve.
- The colour is the class's own, borrowed from `EFFECTS[actor.primaryClass].ranged.color`: the arcane magenta for the wizard, the faith cyan for the priest (D5).
- No actor in the snapshot, no art for its class, an id the catalog does not define, or no state: `[]`, which is what the module already answers for an event it cannot read (and keeps every existing call site compiling).
- `state` is optional because the cue needs the catalog and the board and nothing else; a caller without a state plays nothing rather than guessing.

### 3.5 The impact's drawing (`scenes/effects.ts`)

```ts
/** Where an impact lands, in screen points: the scene converts the cue's cells before calling this. */
export type ImpactDrawing =
  | { style: 'blast'; centre: Pixel; cells: Pixel[]; color: number }
  | { style: 'shot'; to: Pixel; effect: Effect }
  | { style: 'glow'; cells: Pixel[]; color: number };

/** Draws one impact and forgets it: every piece destroys itself, like `playEffect`'s. */
export function playImpact(scene: Phaser.Scene, impact: ImpactDrawing, from: Pixel): void;
```

- `blast`: a `burst` at the centre, a ring (`scene.add.circle` with a stroke) that scales out and fades, and one staggered `flash` per cell of the patch.
- `shot`: `playEffect(scene, effect, from, to)` — the class's own shot, so a sniper's `piercing-shot` reads as a shot — plus a heavier landing than a plain attack's: a wider flash and a burst in the effect's own colour.
- `glow`: one translucent rectangle over each cell, rising a few pixels and fading, plus the same `burst` the others end on.
- Every piece uses `LAYER.effect`; `scenes/depth-usage.test.ts` already refuses a literal depth, so the guard is the plan's, not a new test's.

### 3.6 What this layer does not do

- It does not name a class or an ability in the engine, and it does not add a field to `AbilityDefinition` (ADR 0016 §13).
- It does not offer an ability the engine would refuse: no second active set, no reaction, no movement, no support slot (ADR 0016 §6).
- It does not queue cues: the animation lives as long as its tweens do, and the state that follows is drawn underneath it.
- It does not change what the server accepts: the armed id only makes explicit what `activeSets[0]` already answered.

---

## 4. Tests planned

### Unit — the menu's content (`src/game/ability-menu.test.ts`, new)

- [ ] Happy path: a sniper carrying `piercing-shot` offers one row, named `Tiro Perfurante`, costing `1 Munição`, saying `Dano 6 · ignora cobertura`.
- [ ] A wizard's `fireball` says the area and the allies: `Dano 3 em raio 1 · ignora cobertura · atinge todos, inclusive aliados`.
- [ ] A priest's `area-heal` says `Cura 3 em raio 1` and names no cover.
- [ ] The cost's pool word follows the unit: `Energia` for a magic class, `Munição` for the sniper.
- [ ] `affordable` is false when the pool is under the cost, and true when it is exactly the cost (the boundary).
- [ ] A unit naming no ability offers no rows.
- [ ] A unit naming an id the catalog does not define offers no rows.
- [ ] An unknown id names itself with the fallback word rather than the raw id (D7), through `abilityName`.

### Unit — the armed choice (`src/game/selection.test.ts`, `src/game/highlight.test.ts`)

- [ ] An aim with `abilityId` given sends `useAbility` with that id and the pressed cell.
- [ ] An aim with `abilityId` absent reads the carried one, which is what every existing test already pins.
- [ ] An `abilityId` the catalog does not define is refused with `ability-unknown`.
- [ ] The highlight paints the reach of the given id, and answers two different ids on one state separately (the cache key).

### Unit — the log (`src/game/log.test.ts`)

- [ ] `ability-used` names the ability: `Aya usou Bola de Fogo em (3,4)`.
- [ ] An `abilityId` this build cannot name keeps today's sentence: `Aya usou uma habilidade em (3,4)`.
- [ ] The following `damaged` and `healed` lines are unchanged.

### Unit — the impact (`src/game/presentation.test.ts`)

- [ ] A damage effect with `radius > 0` cues a `blast` covering the engine's own `abilityCells`.
- [ ] A damage effect with `radius === 0` cues a `shot` at the aimed cell, carrying the class's own ranged effect.
- [ ] A heal cues a `glow` over the cells it covers, with the class's own colour.
- [ ] An id the catalog does not define cues nothing.
- [ ] An event with no `state` cues nothing.
- [ ] An actor the snapshot does not know cues nothing.

### Unit — the layout (`src/view/layout.test.ts`)

- [ ] Every row of the menu sits inside the panel, and the rows do not overlap.
- [ ] The close button sits inside the panel and clear of the rows.
- [ ] `abilityMenuRowIndexAt` answers the row a point falls in, and `null` for a point between them and outside the panel.

### Scene — the flow (`src/scenes/MatchScene.test.ts`)

- [ ] Pressing `Habilidade` opens the menu and arms nothing: the mode stays `inspect` and nothing is sent.
- [ ] Picking a row arms the mode and closes the menu, and the reach is the picked ability's.
- [ ] A press outside the panel closes the menu and arms nothing, and reaches no tile under it.
- [ ] Pressing `Habilidade` while the mode is already armed cancels it, as the bar's other buttons do.
- [ ] A state that takes the ability away (the turn moved on) closes the menu.
- [ ] A pick on a row the pool cannot pay arms nothing.
- [ ] The `ability` cue reaches `playImpact` with the cells of the cue (the animation path, with the stub's own drawing calls).

### Tests this plan deliberately changes

- [ ] `src/game/actions.test.ts` — the `canUseAbility` rows flip with D3: the button is offered while the unit carries an ability, whatever its pool says, and the pool gate moves to the row's `affordable`. The reviewer should read this file first.

---

## 5. Dependencies

- **m3-03 approved.** The plan reads `abilityCells`, `abilityById`, `MatchState.catalog` and the `ability-used` event, all of which m3-03 delivered.
- **ADR 0016 accepted.** §3 (the catalog travels with the match), §6 (only the first active set), §11 (`abilityCells`), §13 (no name in the engine).
- **No new asset and no new dependency.** Every drawing is built from the primitives `scenes/effects.ts` already uses.
- **No protocol change.** The catalog and the event's `abilityId` are already in the payloads of version 10; `PROTOCOL_VERSION` does not move.

---

## 6. Decisions

| # | Decision | Why, and the alternative |
|---|---|---|
| D1 | The menu offers **only what the engine reads**: the first active set, resolved in the match's catalog. It is built from a list, so the day the engine reads the second set the menu grows without a rewrite. | ADR 0016 §6 keeps the other slots unread, and a row the server would refuse with `ability-unknown` breaks rule 2. Alternative: list every slot the unit carries and let the server refuse — the player would be offered a button that never works. |
| D2 | **One overlay at a time, and the menu is a modal**: opening it closes the inspection, it is read before every other overlay, and while it is open it swallows every press — a press outside the panel closes it and arms nothing. It closes by its own X or by a press outside. No new key. | The inspection window and the menu would otherwise draw over each other in the middle of the board, and a press that fell through to a tile under a modal is exactly the accident a modal exists to prevent. Alternative: let the two coexist and hit-test the top one — more state for no gain. |
| D3 | **`Habilidade` opens the menu even when the pool cannot pay**: `canUseAbility` becomes `canAct && the unit carries one`, and the row itself is dimmed and not pressable. | Today the button is dead at 0 energy, so the player can neither use the spell nor learn what it costs — which is half of the owner's complaint. The aim still refuses in the engine's own words, so nothing illegal is offered. **This flips an existing test** (see §4). Alternative: keep the gate on the button; the menu stays unreachable until the pool refills. |
| D4 | **Opening the menu cancels the automatic end of turn**, the same way pressing `Terminar turno` does. | The countdown exists to hurry a player who is doing nothing; opening a menu is the player deciding. Without it the turn can end under the open menu. Alternative: let the countdown run and close the menu with the turn. |
| D5 | **The impact borrows the class's own colours** — `EFFECTS[class].ranged.color` — and invents no constant. The sniper's `piercing-shot` is the class's own `tracer` with a heavier landing. | `view/effects.ts` states its own rule: neon belongs to magic, magenta is the arcane and cyan is the faith. A new colour for an ability would break it, and the sniper has no neon to spend. Alternative: a colour of its own per effect kind — a palette with no art behind it. |
| D6 | **The menu's panel is a fixed rectangle sized for one row**, because `createPanel` is built once from a rectangle that never changes. The day the list grows, the rectangle grows with it. | Named so the reviewer is not surprised by the panel's height, which is the one ability m3-03 ships. Alternative: size it for three rows now — dead space in every match until the engine reads a second slot. |
| D7 | **The log names the ability, and keeps a generic sentence for an id this build cannot name.** | The catalog travels with the match (ADR 0016 §3), so a newer server can ship an ability this build has no word for. Printing a raw id to the player is worse than saying "an ability". Alternative: fall back to the id — honest to a developer, noise to a player. |

---

## 7. Out of scope

- **A hit or a miss per body.** The `damaged` event carries `hit` (ADR 0016 §9), and the blast plays whether or not the bodies inside it were hit; the log tells each one's damage. A "the shot went wide" reaction on the figures belongs with the attack feedback, not here.
- **The second active set and the other slots.** They stay unread by the engine (ADR 0016 §6) and unoffered by the menu (D1).
- **New art.** No particles, no spritesheets, no fire asset: the blast is made of the same primitives the existing effects are.
- **A cue queue.** `handleEvents` plays every cue synchronously and the state that follows is drawn at once, so an animation that outlives the batch overlaps the new board — which today's attacks already do. A queue is its own plan.
- **The ability's own highlight tone.** `HighlightTone` already answers `'ability'`, and `drawHighlights` draws it in the attack colour: one line to change, and a colour decision for the owner rather than a bug to fix here.
- **`piercing-shot`'s balance.** Its numbers make it near-strictly better than the sniper's attack (6 damage, fixed reach 4, ignores cover, same cost of one round). That was reported with m3-03 and belongs to m3-04.
- **The Vite pre-bundle cache.** The engine's dist is not invalidated in `node_modules/.vite/deps` when it changes; the durable fix is still waiting for the owner's word.

---

## 8. Commit split proposed

Two commits, as the owner asked (EA-16: the menu first, the animation after).

```
EA-16 ├─ commit 1: o modal + i18n + log
      └─ commit 2: a animação de impacto
```

**Commit 1 — the menu, the names and the log**

```
feat(frontend): open a menu of the unit's abilities before aiming

The Habilidade button armed the class's one ability with no word about it on
the screen. It now opens a menu that names each ability the unit's own slots
carry, what it costs in the unit's own pool and what its effect does, and the
row the player picks is the one armed. The menu offers only the first active
set, which is the only one the engine reads (ADR 0016 §6), and its words come
from the catalogs rather than from the engine (ADR 0016 §13, ADR 0009).

The log line for a use now names the ability, keeping a generic sentence for an
id this build has no word for.

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

Files: `frontend/src/i18n/{catalog.pt-BR.ts,catalog.en-US.ts,abilities.ts,index.ts}`, `frontend/src/game/{ability-menu.ts,actions.ts,selection.ts,highlight.ts,log.ts}`, `frontend/src/view/layout.ts`, `frontend/src/scenes/{HudScene.ts,MatchScene.ts}` and the tests of each.

**Commit 2 — the impact**

```
feat(frontend): draw the impact of an ability where it lands

An ability played nothing on the board: presentationOf answered no cue for
ability-used, damaged and healed. A use now cues an impact chosen by its
effect — a blast over the cells a damage effect covers, the class's own shot
for one that covers a single cell, a glow for a heal — over the engine's own
abilityCells (ADR 0016 §11) and in the class's own colours (D5).

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

Files: `frontend/src/game/presentation.ts`, `frontend/src/scenes/effects.ts`, the `play` case in `frontend/src/scenes/MatchScene.ts`, and their tests.

Both commits stay uncommitted until the owner reviews them.
