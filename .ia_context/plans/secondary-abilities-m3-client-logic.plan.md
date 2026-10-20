# Plan — m3 · Client logic: both slots, the two-step revival and the new words

**Milestone:** m3-client-logic
**Parent feature:** secondary-abilities
**Created:** 2026-10-17
**Status:** pending
**Depends on:** m2's protocol 11 frozen (not merged)

## 1. Objective

The client's pure logic learns that a unit carries **two** active abilities, that aiming a
camouflage is aiming at oneself, that a resurrection is chosen in **two clicks** (the body, then the
cell), and that a basic attack on a camouflaged enemy is refused with `target-hidden`. The menu, the
aim, the highlight, the log, the cues and the two catalogs carry the three new names and the four new
events.

Everything here is testable without Phaser: the module's contract is `PublicState` in and `Intent` or
`readonly string` out. The scene wiring and the drawing are m4.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `frontend/src/game/ability-menu.ts` | modify | `offeredIds` returns both non-null slots; `detailOf` answers the new kinds; the row label falls back to the id |
| `frontend/src/game/ability-menu.test.ts` | modify | Section 4 |
| `frontend/src/game/selection.ts` | modify | Armed ability reads both slots; `target-hidden` in `aimRefusal`; `revive-target` intent; `reviveTargetId` in `ClickInput`; the aim sends `target` |
| `frontend/src/game/selection.test.ts` | modify | Section 4 |
| `frontend/src/game/actions.ts` | modify | `carriedAbility` and `canUseAbility` read both slots, keeping the `activeSets[0]` fallback (index I11) |
| `frontend/src/game/actions.test.ts` | modify | Section 4 |
| `frontend/src/game/highlight.ts` | modify | The reach reads both slots; the revive destination cells are painted after the body is chosen |
| `frontend/src/game/highlight.test.ts` | modify | Section 4 |
| `frontend/src/game/log.ts` | modify | Sentences for the four new events and `target-hidden` |
| `frontend/src/game/log.test.ts` | modify | Section 4 |
| `frontend/src/game/presentation.ts` | modify | A cue for each new event; the two-step aim has its own cue |
| `frontend/src/game/presentation.test.ts` | modify | Section 4 |
| `frontend/src/i18n/abilities.ts` | modify | The three ids and their `NAME_KEYS` |
| `frontend/src/i18n/catalog.en-US.ts` | modify | Names, details, four event sentences and `log.rejection.target-hidden` |
| `frontend/src/i18n/catalog.pt-BR.ts` | modify | The same keys, in Portuguese |
| `frontend/src/i18n/catalog.test.ts` | modify | Parity: both catalogs hold exactly the same keys, and every new key is read |
| `frontend/src/view/layout.ts` | modify | `ABILITY_MENU_ROWS = 2`; the panel height and hit-test follow the constant |
| `frontend/src/view/layout.test.ts` | modify | Rows do not overlap and keep the two-row height |

`frontend/src/protocol.ts` was frozen in m2 and is not touched here. The inspect window is unchanged
(index I8). The scene files are m4.

## 3. Contract of the layer

### 3.1 The menu

```ts
export function offeredIds(unit: UnitState): string[];
```

Returns the non-null entries of `activeSets`, in slot order. The first row is always the class's old
ability, the second the new one. `detailOf(ability)` gains:

| Kind | Detail |
|---|---|
| `camouflage` | `3 turns` and `30% break` |
| `terrain` | `3 rounds`, `radius 1`, the difficult-terrain sentence |
| `revive` | `revive a fallen ally` |

`option()` keeps its shape (`name`, `cost`, `detail`, `affordable`); the name still comes from
`abilityName(id)` with the id as the fallback. A class that carries one ability draws one row.

### 3.2 Selection and the two-step revival

```ts
export interface ClickInput {
  // existing fields unchanged
  /** The fallen ally chosen first, while a resurrection is armed and waiting for its cell. */
  reviveTargetId?: UnitId | null;
}

export type Intent =
  // existing members unchanged
  | { kind: 'revive-target'; unitId: UnitId };
```

- `carriedAbility` and `armedAbility` read any non-null slot; when no row is armed they fall back to
  `activeSets[0]`, so callers that never opened the menu behave as before (I11).
- `aimRefusal` mirrors m1's order: a basic attack on a living enemy whose `camouflage` is not null
  answers `target-hidden`, before the pool, range and sight checks.
- With a `revive` armed and **no** `reviveTargetId`, a click on a defeated ally's body returns
  `{ kind: 'revive-target', unitId }`. It changes nothing on the server; it arms the second step.
- With a `revive` armed and a `reviveTargetId`, a click on a cell returns a `send` intent with
  `{ type: 'useAbility', abilityId, to: cell, target: reviveTargetId }`. The local checks mirror the
  engine: in bounds, within range, no living unit and no body on the cell. The engine remains the
  authority; the local answer only avoids a round trip.
- A click on an empty cell or a living unit while waiting for the body is refused with
  `target-invalid`; clicking the chosen body again cancels the choice.
- Every other intent keeps its current behaviour.

### 3.3 The highlight

The armed reach is painted from the definition and the caster's cell, whichever slot it came from.
Camouflage, with range 0 and no sight, paints the caster's own cell only. Resurrection paints the
cells in range; once the body is chosen the reach is recomputed and the cells holding a living unit
or a body are left unpainted. Difficult terrain is painted by m4 from `state.difficultTerrain`; the
logic layer exposes only what is needed to reach it (the state is already the input).

### 3.4 Log and cues

`log.ts` gains one sentence per new event:

| Event | English |
|---|---|
| `camouflage-ended` (`expired`) | `{target}'s camouflage faded` |
| `camouflage-ended` (`broken`) | `{target}'s camouflage broke` |
| `stood-up` | `{actor} stood up` |
| `terrain-expired` | `The ground dried up` |
| `revived` | `{target} is back on their feet` |

and `log.rejection.target-hidden` — `Target hidden`. The Portuguese catalog writes the same five and
the refusal; the parity test proves both catalogs hold exactly the same key set.

`presentation.ts` gains a cue per new event: the fade/broke, the stand-up, the drying ground and the
return of the revived unit. The scene consumes the cue in m4; here only the mapping is tested.

### 3.5 What this layer does not do

- It does not draw, rotate, pulse or paint a mud overlay (m4).
- It does not decide the rules: refusals mirror the engine, and the server still decides.
- It does not add a status row to the unit sheet (I8) and does not change the inspect window.
- It does not bump the protocol; m2 owns protocol 11.

## 4. Planned tests

**`ability-menu.test.ts`**

- [ ] A unit with two slots offers both ids, in slot order.
- [ ] A unit with one slot offers one row.
- [ ] `detailOf` for each new kind reads the numbers from the definition, not from constants.
- [ ] An affordable camouflage is offered; a sniper with less than 3 ammo lists it as unaffordable.

**`selection.test.ts`**

- [ ] A basic attack on a camouflaged living enemy is refused with `target-hidden`; the same attack
      on an uncamouflaged enemy is not.
- [ ] An armed camouflage aims at the caster's own cell.
- [ ] An armed `revive` and a click on a fallen ally's body returns `revive-target` and sends nothing.
- [ ] The second click on a free in-range cell sends `useAbility` with the body's id in `target`.
- [ ] The second click on a living unit, a body, an out-of-range cell or an out-of-bounds cell is
      refused (`cell-occupied`, `target-out-of-range`, `out-of-bounds`) and sends nothing.
- [ ] Clicking the chosen body again clears the choice.
- [ ] A click on a living unit while waiting for the body is refused with `target-invalid`.
- [ ] No row armed: `armedAbility` still falls back to `activeSets[0]`.

**`actions.test.ts`**

- [ ] `carriedAbility` reads the first and the second slot.
- [ ] With no armed ability, the fallback is still the first slot.

**`highlight.test.ts`**

- [ ] Camouflage, range 0, paints only the caster's cell.
- [ ] A mud cast paints the cells in range and sight.
- [ ] A revive paints the free cells in range once the body is chosen, and never a cell holding a
      living unit or a body.
- [ ] The reach of the second slot is painted when that row is armed.

**`log.test.ts`**

- [ ] Each of the four new events writes its sentence, with the actor/target names filled in.
- [ ] A `camouflage-ended` distinguishes `expired` from `broken`.
- [ ] `target-hidden` writes “Target hidden”, and an unknown reason still falls back.

**`presentation.test.ts`**

- [ ] Each new event maps to its cue.
- [ ] The revived cue carries the destination, so the scene can move the sprite there.

**`catalog.test.ts`**

- [ ] Both catalogs hold exactly the same keys.
- [ ] Every `log.rejection.<reason>` exists for every member of `RejectReason`, `target-hidden`
      included.
- [ ] `abilityName` resolves the three new ids and answers null for an unknown one.

**`layout.test.ts`**

- [ ] `ABILITY_MENU_ROWS` is 2 and the panel height grows by one row.
- [ ] The two row rectangles do not overlap and stay inside the panel.

## 5. Dependencies

- **m2's protocol frozen.** The `PublicState`, `UnitState`, event and reason types this milestone
  reads come from `frontend/src/protocol.ts`, which m2 mirrors. The tests build states by hand, so
  the work can start while m2 is in review.
- m1's rules are the reference the local refusals mirror, but the engine package is a runtime
  dependency already.

## 6. Out of scope

- Scene wiring, sprite work, glow, rotation, mud overlay and manual checks (m4).
- A menu that remembers the last armed row between turns; the current behaviour is kept.
- A status row in the unit sheet (I8).
- A tooltip, an animation timeline or audio.
- Changing the server's answers: the engine and m2 own them.
