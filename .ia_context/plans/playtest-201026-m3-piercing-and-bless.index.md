# Index — Piercing Shot's cost and the Priest's Bless

**Created:** 2026-10-20
**Feature pai:** [playtest-201026.index.md](./playtest-201026.index.md), item 3
**Branch:** `feat/piercing-and-bless` (suggestion)
**Status:** pending — waiting for the owner's approval of this index and of m1 (including its ADR)

## What this delivery covers

Two balance/content changes from the playtest, bundled because the second one reshapes the ability
slot the first one's class also uses:

1. **Piercing Shot costs 2** of the Sniper's own ammunition instead of 1 (ADR 0002: a class spends one
   resource for everything, basic attack and abilities alike — the cost field is already denominated in
   that resource, so this is a data change, not a new mechanism).
2. **The Priest gains Bless**, a new ability that raises an ally's hit chance by 10 points and damage by
   1, for a few of that ally's own turns, for 1 mana. Bless is a genuinely new engine concept: no `buff`
   effect kind exists yet, and the Priest's two active slots are both already spoken for
   (`area-heal`, `resurrection`, from `secondary-abilities`). Per the owner's decision (index D2), the
   ability menu's slot count is generalized to three for every class, not special-cased for the Priest
   alone — the Sniper and the Wizard simply carry `null` in their new third slot.

The delivery reaches every layer the game has, the same shape `secondary-abilities.index.md` used:

| # | Milestone | Status | PR |
|---|-----------|--------|----|
| 1 | [playtest-201026-m3-piercing-and-bless-m1-engine.plan.md](./playtest-201026-m3-piercing-and-bless-m1-engine.plan.md) | [ ] pending | — |
| 2 | [playtest-201026-m3-piercing-and-bless-m2-server-protocol.plan.md](./playtest-201026-m3-piercing-and-bless-m2-server-protocol.plan.md) | [ ] pending | — |
| 3 | [playtest-201026-m3-piercing-and-bless-m3-client-logic.plan.md](./playtest-201026-m3-piercing-and-bless-m3-client-logic.plan.md) | [ ] pending | — |
| 4 | [playtest-201026-m3-piercing-and-bless-m4-client-visual.plan.md](./playtest-201026-m3-piercing-and-bless-m4-client-visual.plan.md) | [ ] pending | — |

m1 is the engine vertical slice: the `buff` effect kind, the `Blessed` status, the third `activeSets`
slot, the hit-chance and damage bonus, and ADR 0024. m2 is data and transport: the `bless` catalog entry,
Piercing Shot's new cost, `CLASS_ABILITIES`, the bot's use of Bless, and protocol 12 in both mirrors. m3
is the client's pure logic: the third menu row, aiming Bless at an ally, the highlight, the log and the
words. m4 is the scene integration and visual pass: the Blessed status indicator and the manual check.

## Decisions taken (owner, 2026-10-20)

Carried from the parent index (D2-D4); repeated here because they are this sub-delivery's own contract:

| # | Question | Answer |
|---|---|---|
| D2 | Priest's third ability slot | Generalize the menu to **three slots for every class**. Only the Priest gets a new ability now; Sniper's and Wizard's third slot is `null` |
| D3 | Bless's duration | **N turns, counted down like Camouflage** — a status with a countdown, recast refreshes rather than stacks |
| D4 | Who Bless can target | **Any living ally in range**, same shape as `area-heal` |

## Implementation choices to review before m1

None of these change the product behaviour above; they are the small decisions the approved answers do
not spell out, listed so the plan is executable without a silent assumption (same purpose as
`secondary-abilities.index.md`'s I1-I11). The owner can overturn any of them before m1 starts.

| # | Choice | Effect and alternative |
|---|---|---|
| I1 | **Bless's duration is 3 turns of the *blessed unit's* own turns**, the turn it was cast on included — the same number Camouflage uses, but counted on the target's turns, not the caster's, since Bless is cast on an ally. Alternative: a different number, or counted on the caster's turns instead (which would make the duration depend on who cast it rather than who carries it) |
| I2 | **Bless needs sight** (`needsSight: true`), aimed like `fireball` and `mud`. Alternative: no sight, like `area-heal`, reaching an ally behind a wall — `area-heal`'s own choice was deliberate narrative ("the one support effect that needs no sight"); Bless defaulting to needing sight keeps that trait unique to healing unless the owner wants it shared |
| I3 | **Bless's target cell must hold a living ally** (own team, including the caster itself) or the use is refused `target-invalid` — mirrors the revive branch's validation shape in `validateUseAbility`. An empty cell or an enemy's cell is refused the same way |
| I4 | **The hit-chance and damage bonus apply to every roll the blessed unit makes** — its basic attack and any damaging ability it casts — because both already resolve through the engine's one `hitChanceFor` (bonus added there covers both for free) and the one flat-damage bonus is added in the two places a flat amount is computed (the basic attack's `damage` and an ability's `effect.amount`). Alternative: restrict the bonus to basic attacks only, which would need a second, narrower hook and contradicts nothing in the approved answers, but is more code for no requested benefit |
| I5 | **Recast refreshes**: a second Bless on an already-blessed ally replaces its remaining turns rather than stacking or failing, exactly like Camouflage's own recast rule |
| I6 | **Bless ends on death** — `blessed` is cleared on `unit-defeated`, like `camouflage` and `prone` are today |
| I7 | **Ability id `bless`, cost 1 (mana, Priest's own resource), range 3** — the cost and the +10/+1 numbers are the feedback's own; the range copies `area-heal`'s |
| I8 | **`CLASS_ABILITIES` becomes `[string \| null, string \| null, string \| null]`** for every class; Sniper and Wizard's new third entry is `null`. Alternative: a variable-length array — a fixed triple keeps the same "two is exact, not a minimum" guarantee `Abilities.activeSets` has today, just one slot wider |
| I9 | **The bot's Bless weight is a provisional, named constant**, tuned in playtest — same posture `secondary-abilities`' I9 took for its own new abilities |
| I10 | **ADR 0024** is the next free number (0023 is the last accepted ADR); it amends ADR 0016's effect union and ADR 0023 §1 ("two active sets") |
| I11 | **No RNG is spent writing the status itself** — like Camouflage, Bless's cast rolls nothing; only the rolls the blessed unit later makes (its own hit roll) read the bonus |

## Rules in one glance

| Class | Ability | Cost | Range | Sight | Effect |
|---|---|---|---|---|---|
| Sniper | `piercing-shot` | **2** ammunition (was 1) | 4 | yes | damage 6, radius 0, ignores cover |
| Priest | `bless` | 1 mana | 3 | yes (I2) | buff: +10 hit chance, +1 damage, 3 turns (I1) |

Every other ability keeps its current numbers and slot.

## Scope

- The engine: the `buff` `AbilityEffect` kind, the `Blessed` status on `UnitState`, the hit-chance and
  damage bonus, the third `activeSets` slot, the replay and hash, ADR 0024.
- The server: `piercing-shot`'s new cost, the `bless` catalog entry, `CLASS_ABILITIES`'s wider tuple, the
  bot's candidate and score for Bless, protocol 12 and both mirrors.
- The client logic: the third menu row, aiming Bless at an ally, the highlight, the log, i18n.
- The client visuals: a Blessed status indicator and the manual verification pass.

## Out of scope

- A third ability for the Sniper or the Wizard — their new slot stays `null` in this delivery.
- Any numeric rebalance beyond Piercing Shot's cost and Bless's own numbers.
- Reactions, Silence, or any ability from the pitch's list not named here.
- A new game-over rule, a new status beyond `Blessed`, or any change to Camouflage/Mud/Resurrection.
- Replay migration for stored matches (same posture as `secondary-abilities` I10: the new state field
  changes the hash; old matches are not re-hashed).
- A perfect bot: Bless's weight is provisional (I9).

## Test strategy

| Case | Where | Why there |
|---|---|---|
| Bless status, countdown, recast, the hit-chance and damage bonus, the third slot, replay and hash | `backend/engine` | The rules are pure, deterministic and integer-only |
| Catalog validation, Piercing Shot's new cost, the bot's new candidate, protocol 12 | `backend/game-server` | The data and the heuristic live there |
| A whole bot match where the Priest casts Bless and the buffed ally then attacks, replayed from its events | `backend/game-server/src/integration.test.ts` | The server is the only place that owns a whole match |
| Third menu row, aiming Bless at an ally, highlight, log, i18n parity | `frontend` unit tests | Pure logic, no DOM test runner in this repo |
| The Blessed indicator, phone width | manual, in m4's pre-review | No visual test infrastructure, same gap `secondary-abilities` had |

## Dependency notes

- **m1 depends on nothing external.** It writes ADR 0024 first; the engine work starts once the ADR is
  accepted.
- **m2 depends on m1 approved**, with the engine types and event shapes frozen. It freezes protocol 12
  in both mirrors, so m3 has a contract to build against.
- **m3 depends on m2's protocol frozen**, not merged — its tests build `PublicState` values by hand.
- **m4 depends on m3 approved.**
- The plan runner checks each milestone's status before starting the next; a milestone marked "em
  progresso" or "revisão necessária" blocks the following one, and the owner is asked whether to
  proceed anyway.
