# 0016. Abilities as data

**Status:** Accepted (2026-10-07).

## Context

`Abilities` is a type the engine has carried since M1 that no rule reads. A class in the game today is a
stat line plus one basic attack: the Wizard and the Priest cast nothing, and the difference between them
is a number. The pitch gives each class a trick of its own, and ADR 0002 gave the magic classes a pool
to pay for it with — a pool that, until ADR 0017, only meditation refilled.

The rules a shot obeys were brought into one place first. ADR 0012 §4 and ADR 0013 put cover into
`coverFor`, and `hitChanceFor` (`backend/engine/src/actions.ts`) is the single expression of a hit
chance, with `resolveHit` the single place a hit is decided. The facing and height rules of m3-02 are
planned to fold into the same function; they are not in the engine yet.

What is missing is a way for the engine to resolve an effect other than the basic attack, without the
engine learning what a Wizard is.

## Decision

1. **An ability is plain data.** `AbilityDefinition` is an id, a cost, a range, whether the target must
   be seen, and one effect. It is carried by the setup and by the state the way the board is, so a
   replay resolves the same ability from the same setup it already carries:

   ```ts
   export interface AbilityDefinition {
     id: string;
     cost: number;          // points of the unit's own pool (ADR 0002, ADR 0011)
     range: number;         // reach in Chebyshev distance
     needsSight: boolean;
     effect: AbilityEffect;
   }

   export type AbilityEffect =
     | { kind: 'damage'; amount: number; radius: number; ignoresCover: boolean }
     | { kind: 'heal'; amount: number; radius: number };
   ```

2. **Two effect kinds, and no more.** A damage effect and a heal effect. Everything m3-03 ships is one
   of the two; a third kind is a new record, not a new branch.
3. **The catalog travels with the match.** `MatchSetup.catalog` is optional, exactly as `Board.props`
   is (ADR 0012 §1); `MatchState.catalog` is always present, exactly as `BoardState.props` is. A setup
   that leaves it out has no abilities to use and is still a legal match.
4. **The catalog is validated when the setup is read.** An unknown effect kind, a negative cost, a
   negative radius, a range below zero and an empty id are refused at `validateSetup`, so a broken
   catalog fails at the door and never mid-match.
5. **The action names a cell, never a unit.** `{ type: 'useAbility'; actor; abilityId; to }`. A unit is
   affected because it stands on a cell of the effect; nothing aims at a unit directly. This is what
   makes an area effect expressible with the same action as a single-target one.
6. **A unit may only use an ability in its own slots.** The id is looked up in the caster's own
   `abilities`; anything else is `ability-unknown`. A unit with no abilities cannot reach this action at
   all.
7. **The refusals, in this order:** `game-over`, `not-your-turn`, `already-acted`, `ability-unknown`,
   the pool refusal (`no-mana` or `no-ammunition`, reused from ADR 0011 §2), `out-of-bounds`,
   `target-out-of-range`, `no-line-of-sight`. A refused use emits no event and leaves the state
   unchanged, cost included.
8. **The resolution, in this order:**
   1. `ability-used` — spends the cost, sets `hasActed`, and carries `to`, `abilityId` and the
      `rngState` the rolls left behind.
   2. For every living unit standing on a cell of the effect, in setup order: `damaged { target, hit,
      damage }` for a damage effect, `healed { target, amount }` for a heal.
   3. `unit-defeated` for every unit the damage brought to zero, in the same setup order, after every
      `damaged` of the resolution.
9. **A damage effect rolls through the same `resolveHit` as the basic attack**, once per affected unit.
   Cover applies (ADR 0012, ADR 0013) unless the effect says `ignoresCover`; the facing and height rules
   of m3-02 apply through the same function once they are in the engine. One ability, several units,
   several draws — all of them inside the `rngState` the `ability-used` event carries, so a replay
   resolves every unit the same way.
10. **A heal never rolls.** It adds its amount, capped at the target's `maxHealth`, and it skips a
    defeated unit entirely: a body is not healed back.
11. **The area is a Chebyshev radius around the target cell**, in bounds, the target cell included. A
    radius of 0 is the single cell. `abilityCells` is exported from the engine so the client paints
    exactly the cells the server will apply — the rule and the highlight cannot disagree.
12. **A damage area hurts everyone standing in it**, the caster and its own allies included. This is
    what the pitch's "punishes grouped enemies" costs: placing the shot is the Wizard's problem, and an
    area that spares allies would remove the reason to place it at all.
13. **The engine never learns a class or an ability name.** The id is an opaque string, the effect is a
    union, and the words on the screen come from the catalogs (ADR 0009). The split ADR 0011 §consequences
    set for mana and energy applies to the whole feature: the mechanism's word in the code, the
    fiction's word on the screen.
14. **`PROTOCOL_VERSION` rises to 10** — 8 being ADR 0014's and ADR 0015's, and 9 ADR 0017's — for the
    action, the events and the new refusal code.

## The three definitions m3-03 ships

Provisional, and tuned in m3-04 against the rule above:

| Class | Id | Cost | Range | Sight | Effect |
|---|---|---|---|---|---|
| Sniper | `piercing-shot` | 1 ammunition | 4 | yes | damage `attack + 2`, radius 0, ignores cover |
| Wizard | `fireball` | 2 mana | 3 | yes | damage 3, radius 1, ignores cover |
| Priest | `area-heal` | 2 mana | 3 | no | heal 3, radius 1 |

Each one exercises a different part of the mechanism — a single target that beats cover, an area that
beats cover, and a support effect — and each stays inside the class's identity in the pitch. The
Priest's heal is the one effect that needs no sight, so it reaches an ally behind a wall.

## Consequences

- The bot has something to weigh against the basic attack. The scoring itself is m3-04's; m3-03 only
  lets the ability into the candidates (ADR 0012's `applyAction` is the legality check it already uses).
- The client arms an ability like it arms a move, and paints `abilityCells` while it is armed. The
  client still decides nothing: a click the server would refuse is refused with the server's reason.
- `AbilityEffect` is a union the engine switches on, so a new kind is a compile error at every place
  that reads one, and not a silent no-op.
- The board stays immutable: no ability in this milestone creates, destroys or moves anything. The
  Wizard's wall and a push need their own record, and are the reason the union is closed rather than
  open.
- What the engine still does not know, and this record does not decide: cooldowns, charges, per-match
  uses, reactions (ADR 0007), the second active set, and passive or movement abilities. `activeSets[1]`,
  `reaction`, `movement` and `support` stay unread.
