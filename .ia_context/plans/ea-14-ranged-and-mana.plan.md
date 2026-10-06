# Plan: EA-14 · Ranged basic attack and mana for magic classes

**Milestone:** lot 2 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** ADR 0011 accepted (amends ADR 0002); EA-1 merged (line of sight for ranged attacks)
**Created:** 2026-10-05
**Status:** ready for review, blocked until ADR 0011 is accepted

## 0. Findings

- **Current build (read in `backend/game-server/src/map.ts`):** Wizard and Priest have `range: 1` and `magazine: null`. They only attack in melee.
- **Empty magazine today** (`reachOf` in `frontend/src/game/selection.ts`, and `attackDamage` in `bot.ts`): the Sniper attacks in melee with range 1 and half damage. The new rule removes this (ADR 0011).
- **The engine has no mana.** `Unit` has `magazine` and `ammo`, and the validation of reload is generic. The mechanism can carry mana (ADR 0002: "the mechanism is generic").
- **Characters prototype (`eldritch-alley-characters-v1`):** one basic attack per class, melee animation when adjacent, ranged animation from two cells away, resource spent on the strike frame, meditation refills to full, capacity 3.

## 1. Objective

Every roster class has one basic attack, refused when its resource is empty, with the same effect at any distance. Wizard and Priest get ranged attacks and mana. The refusal reason is shown to the player. Meditation is the mana refill.

## 2. Roster scope

The roster in the match server is Sniper, Wizard and Priest (`CLASS_ORDER` in `map.ts`). Initiate and Adept are in the characters prototype but are not in the roster; they are M3 content. This plan covers only the three classes. The class data format must accept the others without engine change.

## 3. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/types.ts` | modify | `RejectReason` gains `'no-mana'`. `no-ammunition` is added too. `attacked` event carries `resource: 'ammo' \| 'mana'` instead of `ammoSpent` only |
| `src/actions.ts` | modify | `validateAttack`: if `magazine !== null && ammo === 0`, refuse with `no-ammunition` or `no-mana` by the unit's `resourceKind`. Melee reach fallback removed: reach is always `range` |
| `src/actions.ts` | modify | `validateReload` covers meditation: same action, same refill rule. Reason stays `magazine-full` for a full pool |
| `src/match.ts` | modify | Unit data carries `resourceKind` (`'ammo' \| 'mana'`) from the class |
| `src/actions.ts` (damage) | modify | `resolveHit` damage is `attack` for every distance; `meleeDamage` removed |
| Tests in `actions.test.ts`, `ammo.test.ts` | modify | Section 4 |

**Class data (`backend/game-server/src/map.ts`):**

| Class | Resource | Capacity | Range (proposed, D1) |
|---|---|---|---|
| Sniper | ammunition | 3 (unchanged) | 3 (unchanged) |
| Wizard | mana | 3 | 3 |
| Priest | mana | 3 | 2 |

### Server (`backend/game-server`)

| File | Operation | What changes |
|---|---|---|
| `src/map.ts` | modify | Wizard and Priest: `magazine: 3`, `resourceKind: 'mana'`, ranges from the table above |
| `src/bot.ts` | modify | `attackDamage` has no melee branch. The reload score (`emptyMagazineReload`) applies to any empty resource. Full bot change is EA-10 |

### Protocol and client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/protocol.ts` | modify | `no-ammunition`, `no-mana` in `RejectReason`; `attacked` carries `resource` |
| `src/game/log.ts`, i18n catalogs | modify | Refusal messages: "sem munição, recarregue" / "sem mana, medite" (pt-BR), and English equivalents |
| `src/game/selection.ts` | modify | `reachOf` returns `range` always; the target shows the refusal reason when the resource is empty |
| `src/view/unit-look.ts` | modify | Resource pips: warm for ammunition, cyan for mana (replaces the "pips not drawn" limit of DT-57) |
| Attack animation (file to confirm in `scenes/`) | modify | Melee animation when adjacent, ranged from two cells; impact per class from the handoff timelines |
| Meditation animation | create | Magic circle (Wizard, Initiate) and light beam (Priest) as data-driven effects |
| Protocol version | modify | Bump: `attacked` changes shape |

**Animations.** Timings come from the characters handoff, section 3: windup 250 to 520, strike 520 to 760 (resource spent here), travel 140 for shots and beams, 300 for the sky column, 520 for missiles (70 ms between darts), impact 260. The client picks the variant by the distance the server reports.

## 4. Contract of the layer

- **Basic attack** `attack { actor, target }`:
  - accepted: `attacked` with `resource` and the damage, when the resource spent is one unit;
  - rejected: `no-ammunition` or `no-mana` (empty resource), `target-out-of-range` (beyond `range`), `no-line-of-sight` (EA-1), `already-acted`, `target-invalid`.
- **Refill** `reload { actor }`: spends the action, refills to `magazine`. Rejected with `magazine-full` when full, `already-acted` when the action is spent.
- **Not done by this layer:** mana regeneration, abilities and spells (EA-13, after the deploy), Initiate and Adept.

## 5. Tests planned

Engine (`actions.test.ts`, `ammo.test.ts`):
- [ ] Wizard with mana attacks at range 1 and at range 3: both accepted, both spend one mana.
- [ ] Wizard with no mana attacks at any distance: rejected `no-mana`, no event, state unchanged.
- [ ] Sniper with an empty magazine adjacent to a target: rejected `no-ammunition`. Replaces the melee fallback case of EA-1's plan.
- [ ] Sniper with ammunition adjacent: accepted, damage is the full attack (no halving).
- [ ] Damage is the same at range 1 and range 3 for the same attacker and hit roll.
- [ ] Meditation (`reload`) refills mana to 3 and spends the action; a second one is `already-acted`.
- [ ] Meditation with full mana: `magazine-full`.
- [ ] Priest at range 2 accepted; range 3 rejected `target-out-of-range`.
- [ ] Ranged attack through a building: `no-line-of-sight` (EA-1 rule applies to magic too).
- [ ] Hash test: same seed and actions give the same state (ADR 0005).

Client:
- [ ] Animation variant is melee at distance 1 and ranged at distance 2 or more.
- [ ] Resource pips: three cyan pips for mana, warm for ammunition, none for a unit with no resource.
- [ ] Refusal messages exist in both catalogs (`catalog.test.ts`).

## 6. Dependencies

- ADR 0011 accepted.
- EA-1 (line of sight in `validateAttack`).
- EA-2 is not required, but the same protocol version bump is shared: merge EA-2 first, then rebase.
- EA-10 (bot) reads the new reasons; the bot change is EA-10's.
- EA-11 (balance) after this lands.

## 7. Decisions

- **D1. Ranges of Wizard and Priest (proposed, not confirmed):**
  - A. Wizard 3, Priest 2. The Priest's sky column is closer; matches the prototype's "two cells away" wording. **Recommended.**
  - B. Both 3. Simpler, but the Priest loses its identity.
  - C. Both 2. Shorter reach than the Sniper for both; makes the Sniper's range its strength.
- **D2. Capacity of mana (proposed 3):**
  - A. 3, the prototype value. **Recommended.**
  - B. Other value; the EA-11 balance pass tunes it.
- **D3. Refusal messages:** exact wording of "sem munição, recarregue" and "sem mana, medite" in both catalogs. Owner confirms the English text.

## 8. Out of scope

- Mana regeneration and abilities (M3).
- Spells (EA-13, after the deploy).
- Initiate and Adept classes (M3 roster).
- Balance changes beyond the data above (EA-11).
