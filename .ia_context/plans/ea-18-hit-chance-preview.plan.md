# Plan — EA-18 (provisional id, confirm against the owner's own tracker) · The odds, before the shot

**Milestone:** —
**Parent feature:** m3-rules-and-content — the owner's request before opening the MR
**Created:** 2026-10-13
**Status:** pending
**Requires:** m3-01 (cover), m3-02 (facing & height) and m3-03 (abilities) merged — all three already
land on this branch. Builds on EA-15's cover badge and EA-16's ability menu, reusing their drawing seam
on `UnitSprite`.

## 1. Objective

The player aims a shot blind today: the highlight paints where it may land, but not how likely it is
to land there. `backend/engine/src/actions.ts` already computes exactly this number —
`hitChanceFor(state, attacker, target, ignoresCover)` reads cover, direction and height in one pure
expression and is already the function `resolveHit` rolls against — it is simply not exported past the
engine's package boundary. This plan exposes it, and shows it over the head of whoever it is read
against: one percentage while a basic attack is armed and the pointer rests on a target, and one per
living body inside an armed ability's blast while the pointer rests on where it would land.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|---------------|
| `backend/engine/src/index.ts` | modify | Export `hitChanceFor` beside the package's other read-only rules (§3) |
| `frontend/src/game/targetPreview.ts` | create | Pure: `attackChance`, `abilityChances` (§3) |
| `frontend/src/game/targetPreview.test.ts` | create | §4 |
| `frontend/src/game/press.ts` | modify | `Gestures.move` answers `{ kind: 'hover'; at: Pixel }` for a mouse pointer with no finger down — the exact gap the module's own comment already names |
| `frontend/src/game/press.test.ts` | modify | §4 |
| `frontend/src/scenes/MatchScene.ts` | modify | `previewCell` state; `handlePointerMove` resolves it from a `hover` outcome and redraws only the sprites it touches; the long press shows the same preview instead of opening the inspect sheet while `Atacar`/`Habilidade` is armed (§6, D1); cleared on a mode change, an armed-ability change, a state update, or `finish()` |
| `frontend/src/scenes/MatchScene.test.ts` | modify | §4 |
| `frontend/src/scenes/units.ts` | modify | `hitChanceBadge: Phaser.GameObjects.Text`, `setHitChanceBadge(text: string \| null)`, drawn above the cover badge so both can show at once (§6, D4) |
| `frontend/src/view/theme.ts` | modify | `HIT_CHANCE_BADGE_FILL`/`HIT_CHANCE_BADGE_STROKE` (§6, D3) |
| `frontend/src/view/theme.contrast.test.ts` | modify | §4 |
| `frontend/src/view/layout.ts` | modify | The badge's gap above the cover one (mirroring `COVER_BADGE.gapAboveArrow`) |
| `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | `hud.target.chance` = `'{value}%'` in both — the number is drawn from the catalog like every other word on the screen (ADR 0009) |
| `frontend/src/i18n/catalog.test.ts` | modify | §4 |

## 3. Contract of the layer

```ts
// backend/engine/src/index.ts — one new line
export { hitChanceFor } from './actions';

// frontend/src/game/targetPreview.ts

/** The odds of a basic attack against this target, exactly what `resolveHit` would roll right now. */
export function attackChance(state: PublicState, attacker: UnitState, target: UnitState): number;

/**
 * The odds against every living unit an armed ability would hit from `to`, keyed by unit id — the
 * caster included when it stands inside its own blast (ADR 0016 §12, the friendly-fire rule). Empty
 * for a heal effect, which never rolls (ADR 0016 §9): there is nothing to preview.
 */
export function abilityChances(
  state: PublicState,
  caster: UnitState,
  ability: AbilityDefinition,
  to: Position,
): ReadonlyMap<UnitId, number>;
```

- Both functions read `state` only: no `rngState` is consumed, no event is produced, nothing is sent.
  `abilityChances` walks `abilityCells(state, to, ability)` exactly the way the engine's own resolution
  and the client's own highlight already do, so the bodies it prices are the bodies the shot would
  actually reach.
- `attackChance` never passes `ignoresCover: true` — a basic attack never ignores cover, which is the
  same default `resolveHit` falls back to.
- **What this layer does not do.** It does not decide which cell is "under the pointer" — the scene's
  own hit-testing (`unitAtPoint`/`cellAt`, already built for a click) answers that. It never shows a
  number for a cell the highlight itself would not legally offer (out of range, out of sight, a dead
  unit, the player's own team while `Atacar` is armed): the badge is a readout of a shot the player
  could actually take, never a hint about one they could not.

## 4. Tests planned

**Unit — `game/targetPreview.test.ts`:**
- [ ] `attackChance` matches the engine's own `hitChanceFor` exactly, for the same cover, direction and
  height fixtures `actions.test.ts` already uses.
- [ ] `abilityChances` with `piercing-shot` (radius 0) returns exactly one entry, for whoever occupies
  the aimed cell.
- [ ] `abilityChances` with `fireball` (radius 1) returns one entry per living unit inside
  `abilityCells(state, to, ability)` — allies and the caster included when they stand inside it.
- [ ] `abilityChances` with `area-heal` returns an empty map.
- [ ] A defeated or permanently-dead unit inside the radius is excluded.
- [ ] Neither function changes `state.rngState` or any other field of the state it is handed.

**Unit — `game/press.test.ts`:**
- [ ] A mouse move with no finger down answers `{ kind: 'hover', at }` with the pointer's own position.
- [ ] A touch move (a finger down) never answers `hover` — `pan`, `pinch` and `none` read exactly as
  they do today.
- [ ] `hover` never arms, disarms or reads `waiting()`.

**Scene — `scenes/MatchScene.test.ts`:**
- [ ] Hovering an enemy while `Atacar` is armed sets that unit's badge to `attackChance`; moving off it
  clears the badge (a spy on `UnitSprite.prototype.setHitChanceBadge`, the EA-15 seam).
- [ ] Hovering a cell the attack highlight does not cover (out of range, out of sight) shows nothing.
- [ ] With `Habilidade` armed on `fireball`, hovering a cell shows one badge per living unit inside the
  blast, caster included when it stands there.
- [ ] With `Habilidade` armed on `area-heal`, hovering any cell shows no badge.
- [ ] On a touch device, a long press while `Atacar`/`Habilidade` is armed shows the badge instead of
  opening the unit-inspect sheet; lifting clears the badge without arming anything new, and a plain tap
  afterwards still commits the shot exactly as it does today.
- [ ] Switching the mode away from `attack`/`ability`, the turn moving on, or the match ending clears
  every badge.
- [ ] No badge is drawn while the camera's quarter-turn animation is in flight (DT-86's own rule).

## 5. Dependencies

- m3-01, m3-02 and m3-03 (cover, facing/height, abilities) — all already committed on this branch, and
  this plan reads their output (`coverFor`, `attackDirection`, `heightBonus`, `abilityCells`) through
  `hitChanceFor` alone, never re-deriving any of it on the client.
- EA-15's cover badge and EA-16's armed-ability resolution (`armedAbility`, `abilityById` in
  `selection.ts`), reused rather than duplicated for "what ability is armed right now."

## 6. Out of scope

- **Any change to `resolveHit` or `hitChanceFor` themselves.** The number shown is exactly the number
  the server would roll; this plan only widens who may read it.
- **A number for a heal.** The owner may want a different cue later (the amount healed, say); not asked
  for here, and `abilityChances` deliberately answers empty rather than inventing one.
- **A dedicated new touch gesture.** The long-press reveal (D1) reuses the gesture that already exists
  for inspection; no new gesture is added and no haptic feedback changes.
- **Persisting the preview anywhere.** It is draw-only: no event, no log line, no protocol change.

## 7. Decisions

**D1 · The touch interaction.** Holding (long press) while `Atacar`/`Habilidade` is armed shows the
badge and swallows the gesture — the inspect sheet does not open in these two modes while the gesture
is held. The player lifts, then taps again, to actually commit the shot. **Recommended**: it is the
closest touch analogue to "hover, then click," and teaches the player nothing new — the long press
already exists and already means "look before you act" (EA-6). **Alternative**: keep the long press
opening the inspect sheet exactly as today in every mode, and add a dedicated second gesture for the
preview — more predictable per mode, but a gesture the player has to discover that the owner did not
ask for.

**D2 · Redraw cost on `pointermove`.** Recompute only the sprites inside the current aim's own radius
(one, for a basic attack; up to the ability's radius otherwise) rather than a full `redraw()` on every
reported mouse position. **Recommended**: a full board redraw dozens of times a second for a mouse
sweep would be the one place this feature could be felt as lag; nothing else in the scene redraws on
`pointermove` today.

**D3 · The badge's colour.** Reuse `ACCENT_COLOR` (`HIGHLIGHT_ATTACK_COLOR`'s own red) for the fill,
paper for the stroke — tying the number visually to the attack reach it is already painted over.
**Alternative**: the cover badge's paper-on-ink pair, which reads as passive information rather than
"this is what aiming here does right now."

**D4 · Stacking with the cover badge.** When a unit is both in cover and being aimed at, both badges
show, the hit-chance one above the cover one — two short lines rather than one replacing the other,
since they answer different questions ("is this target protected" versus "what happens if I shoot
now"). No alternative proposed; flagged so the reviewer is not surprised by two lines over one head.
