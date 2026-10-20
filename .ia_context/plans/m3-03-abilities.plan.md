# Plan — m3-03 · Abilities as data, and mana regeneration

**Milestone:** m3-03
**Parent feature:** m3-rules-and-content
**Created:** 2026-10-07
**Status:** pending
**ADRs:** 0015 · Abilities as data · 0016 · Mana regeneration, amending 0011 (to write)

## 1. Objective

A class stops being a stat line plus one basic attack. Each class carries one **active ability**,
defined as data: what it costs, how far it reaches, what it does to the cells it touches. The engine
learns to resolve it and to replay it, the bot learns to consider it, and the client learns to aim
it. Mana, which today only comes back by meditation, regenerates one point at the start of the
unit's turn.

Two slices, one commit each: **A** is mana regeneration, **B** is the abilities themselves.

## 2. Files changed

### Slice A · Mana regeneration (ADR 0016)

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0016-mana-regeneration.md` | create | One point at the start of the turn, capped, magic pools only |
| `backend/engine/src/types.ts` | modify | The `regained` event |
| `backend/engine/src/actions.ts` | modify | `buildEvents` for `endTurn` emits `regained` for the unit coming on turn |
| `backend/engine/src/events.ts` | modify | `applyEvent` for `regained` |
| `backend/engine/src/mana.test.ts` | modify | Section 4 |
| `frontend/src/game/log.ts`, `frontend/src/i18n/catalog.*.ts` | modify | The line for the regained point |

### Slice B · Abilities (ADR 0015)

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0015-abilities-as-data.md` | create | The definition, the effect kinds, the resolution order, what the engine still does not know |
| `docs/adr/README.md` | modify | The new rows, including 0016 |
| `backend/engine/src/types.ts` | modify | `AbilityDefinition`, `AbilityEffect`, the `useAbility` action, the `ability-used`, `damaged` and `healed` events, the new refusals |
| `backend/engine/src/abilities.ts` | create | `abilityById`, `abilityCells` (the cells an ability covers from a target cell), `abilityTargets` (is this cell a legal aim) |
| `backend/engine/src/actions.ts` | modify | `validateUseAbility` and the events of an accepted use |
| `backend/engine/src/events.ts` | modify | `applyEvent` for `ability-used`, `damaged` and `healed` |
| `backend/engine/src/match.ts` | modify | The catalog is validated in `validateSetup` and carried by the state |
| `backend/engine/src/index.ts` | modify | Export `abilityCells`, so the client paints the same cells the server applies |
| `backend/engine/src/forbidden.test.ts` | modify | `abilities.ts` joins `GUARDED_MODULES` |
| `backend/engine/src/abilities.test.ts` | create | Section 4 |
| `backend/engine/src/actions.test.ts`, `properties.test.ts`, `hash.test.ts` | modify | Section 4 |
| `backend/game-server/src/abilities.ts` | create | The three definitions, one per class |
| `backend/game-server/src/map.ts` | modify | The setup carries the catalog, and each class names the ability in `activeSets[0]` |
| `backend/game-server/src/bot.ts` | modify | The ability joins the candidates, scored against the basic attack |
| `backend/game-server/src/bot.test.ts`, `integration.test.ts` | modify | Section 4 |
| `backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts` | modify | Version 9: the action, the events and the refusals |
| `backend/game-server/src/action-shape.ts` | modify | `useAbility` as the client may send it |
| `frontend/src/game/actions.ts` | modify | The armed mode takes an ability id |
| `frontend/src/game/selection.ts` | modify | The click aims the ability and refuses what the engine refuses |
| `frontend/src/game/highlight.ts` | modify | The cells `abilityCells` answers are painted while the ability is armed |
| `frontend/src/scenes/HudScene.ts`, `frontend/src/view/layout.ts` | modify | The ability button in the dashboard, with its cost |
| `frontend/src/game/log.ts`, `frontend/src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | The sentences of the three events, and the three ability names |

## 3. Contract of the layer

**The definition.** Plain data, carried by the setup and by the state, the way the board is:

```ts
export interface AbilityDefinition {
  id: string;
  /** Points of the unit's own pool (ADR 0002, 0011). */
  cost: number;
  /** Reach in Chebyshev distance. */
  range: number;
  /** Whether the caster must see the target cell. */
  needsSight: boolean;
  effect: AbilityEffect;
}

export type AbilityEffect =
  | { kind: 'damage'; amount: number; radius: number; ignoresCover: boolean }
  | { kind: 'heal'; amount: number; radius: number };
```

A unit may use an ability whose id is in its own `abilities` slots. The catalog travels in
`MatchSetup.catalog` (optional, the way `Board.props` is in m3-01) and in `MatchState.catalog`
(always present), so a replay rebuilds the same resolution from the setup it already carries.

**The action.** `{ type: 'useAbility'; actor: UnitId; abilityId: string; to: Position }`. The target
is always a cell; a unit is hit because it stands there. Refusals, in this order:
`game-over`, `not-your-turn`, `already-acted`, `ability-unknown`, the pool refusal (`no-mana` or
`no-ammunition`, reused from ADR 0011), `out-of-bounds`, `target-out-of-range`, `no-line-of-sight`.

**The resolution.** Reading the events of an accepted use, in order:

1. `ability-used` — spends the cost, sets `hasActed`, carries `to`, `abilityId` and the `rngState`
   the rolls left behind.
2. For every living unit on a cell of the effect, in setup order: `damaged { target, hit, damage }`
   for a damage effect, `healed { target, amount }` for a heal.
3. `unit-defeated` for every unit the damage brought to zero or below, in the same order.

A damage effect rolls once per affected unit through the same `resolveHit` the basic attack uses, so
cover (m3-01), direction and height (m3-02) apply unless the effect says `ignoresCover`. A heal
never rolls, is capped at `maxHealth`, and never touches a defeated unit.

**The area.** `abilityCells(state, to, ability)` is every cell within the effect's Chebyshev radius
of `to`, in bounds, the target cell included. A radius of 0 is the single cell.

**Mana regeneration (slice A).** When a turn ends, the unit that comes on turn regains one point of
mana if its pool is `mana`, up to its capacity. An ammunition class never regenerates. The event is
`regained { actor, resource, amount }`, emitted right after `turn-ended`, so the log can show it and
a replay does not have to infer it.

**What this layer does not do.** No cooldowns, no charges per match, no abilities that change the
board (creating cover, pushing a unit), no reactions (ADR 0007), no second active set, no passive or
movement abilities. `Abilities.activeSets[1]`, `reaction`, `movement` and `support` stay unread.

## 4. Tests planned

**Engine — mana (slice A)**
- [ ] A magic class with 0 mana ends its turn and comes back with 1.
- [ ] Regeneration never goes above the capacity.
- [ ] An ammunition class regenerates nothing.
- [ ] A unit that dies and leaves the initiative regenerates nothing.
- [ ] The `regained` event appears exactly when a point is actually regained.
- [ ] Hash: a match with meditation and regeneration replays to the same state.

**Engine — abilities (`abilities.test.ts`)**
- [ ] `abilityCells` over radius 0, 1 and 2 returns the cells the table says, clipped at the board.
- [ ] A damage ability spends its cost by the amount of the definition, and `no-mana` /
      `no-ammunition` is refused when the pool is short, with no event and no state change.
- [ ] An ability id that is not on the caster's slots is refused with `ability-unknown`.
- [ ] Aims beyond `range` are `target-out-of-range`; a cell out of sight is `no-line-of-sight` when
      the definition says `needsSight`, and accepted when it does not.
- [ ] An area damage ability rolls once per affected unit, and every roll is in the `rngState` the
      `ability-used` event carries: a replay with the same seed resolves every unit the same way.
- [ ] Cover lowers the roll of an ability that does not ignore it, and does not touch one that does.
- [ ] A heal is capped at `maxHealth` and skips a defeated unit.
- [ ] Allies inside the area take the damage of a damage effect (decision D2).
- [ ] `unit-defeated` comes after every `damaged` of the same resolution, in setup order.
- [ ] `canStillAct` is true for a unit that has only an affordable ability left.
- [ ] Hash: the same seed and the same actions with abilities give the same final state.

**Server**
- [ ] The catalog validates: an unknown effect kind, a negative cost or an empty id throws.
- [ ] The bot uses the ability when it scores above the basic attack, and never uses one it cannot
      pay for (asset on the candidates it already filters with `applyAction`).
- [ ] A bot match that ends with an ability is replayed from its events to the same hash
      (`integration.test.ts`).

**Client**
- [ ] The armed ability paints exactly `abilityCells`, and a click outside refuses with the same
      reason the server would answer.
- [ ] The button is dimmed with the cost the player cannot pay, and the refusal arrives with the
      reason from the server.
- [ ] Every new sentence exists in both catalogs (`catalog.test.ts`).

## 5. Dependencies

- m3-01 (cover), because the Wizard's effect carries `ignoresCover` from the first commit.
- m3-02 (direction and height), only in that `resolveHit` gains its parameters; the two can land in
  either order if m3-01 is already in.
- ADR 0015 and ADR 0016 accepted before slice B starts, and 0016 before slice A.
- The numbers in the definitions are provisional; m3-04 tunes them.

## 6. Out of scope

- Reactions (ADR 0007, DT-17) and resurrection (DT-05). Both are decided rules with no code, and
  both are their own milestone: a reaction window pauses the match, which is a different mechanism
  from resolving an ability.
- Abilities that change the board or move a unit (Wall, Push). The board is immutable in the engine.
- Cooldowns, charges, per-match uses, and the second active set.
- The full ability list of the pitch. One per class, as the owner decided on 2026-10-07.
- Initiate, Adept, Assaulter and the rest of the roster. The data format takes them; the roster does
  not change.

## 7. Decisions

**D1 · The three abilities.** Proposed set, to be tuned in m3-04:

| Class | Id | Cost | Range | Sight | Effect |
|---|---|---|---|---|---|
| Sniper | `piercing-shot` | 1 ammo | 4 | yes | damage `attack + 2`, radius 0, ignores cover |
| Wizard | `fireball` | 2 mana | 3 | yes | damage 3, radius 1, ignores cover |
| Priest | `area-heal` | 2 mana | 3 | no | heal 3, radius 1 |

**Recommended**: each one exercises a different part of the mechanism — a single target that beats
cover, an area that beats cover, and a support effect — and each stays inside the class's identity
in the pitch. The Priest's heal is the one effect that needs no sight: it reaches an ally behind a
wall, which is a tactical wrinkle worth having. Alternative: Precise shot (more range and damage the
higher the caster stands) for the Sniper, which leans on m3-02 instead, and a sight-requiring heal.

**D2 · Friendly fire.** A damage area hurts every unit standing in it, the caster and its allies
included. **Recommended**: it is what "punishes grouped enemies" means in the pitch, and it makes
positioning the cost of the Wizard. Alternative: allies are spared, which is friendlier but removes
the reason to place the shot carefully.

**D3 · The engine's vocabulary.** The engine knows `cost`, `range`, `effect`; it never learns the
words `fireball` or `mana`. The id is an opaque string, the effect is a union, and the screen names
come from the catalogs. A new class is a new definition in `backend/game-server/src/abilities.ts`.

**D4 · The bot.** It scores an ability as `expected damage × affected enemies` and compares it with
the basic attack, using the same `applyAction` legality check it already uses. **Recommended**: small
enough to keep the bot deterministic and open about what it weighs. The full scoring belongs to
m3-04, where the numbers it reads are being set anyway.
