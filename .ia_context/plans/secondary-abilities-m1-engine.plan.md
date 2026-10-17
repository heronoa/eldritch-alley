# Plan — m1 · Engine: camouflage, difficult terrain, prone and resurrection

**Milestone:** m1-engine
**Parent feature:** secondary-abilities
**Created:** 2026-10-17
**Status:** pending
**ADR:** 0023 — Statuses, difficult terrain and resurrection (written before the code)

## 1. Objective

The deterministic engine learns the three effects the second class ability needs: a **camouflage**
status that basic attacks cannot target, a **difficult-terrain** layer that doubles the cost of
entering a cell and can knock a walker **prone**, and **resurrection** of a defeated ally whose body
is still on the map. Every new state change is an event, every new roll is carried by an event, and
`applyEvents` rebuilds a match with the same final hash as live play.

The layer's public contract is the new plain-data types, the new `useAbility.target` field, the new
events and `target-hidden`; the existing `newMatch`, `applyAction`, `applyEvents`, `publicState` and
`hashState` signatures do not change. The server and the client consume only this contract.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `docs/adr/0023-statuses-terrain-and-resurrection.md` | create | The ten decisions below, their context, consequences and the ADRs they amend |
| `docs/adr/README.md` | modify | The 0023 row: “Statuses, difficult terrain and resurrection — Accepted (amends 0016 §6 and 0003)” |
| `backend/engine/src/types.ts` | modify | Three effect kinds; `Camouflage`; `DifficultCell`; `UnitState.camouflage` and `.prone`; `MatchState.difficultTerrain`; `useAbility.target?`; `ability-used.target?`; `moved.rngState` and `.prone`; `camouflage-ended`, `stood-up`, `terrain-expired`, `revived`; `target-hidden` |
| `backend/engine/src/abilities.ts` | modify | The comment that the union has two kinds; `abilityCells` reads the common `radius` unchanged |
| `backend/engine/src/actions.ts` | modify | `carriesAbility` reads both sets; `target-hidden` in `validateAttack`; the revive checks in `validateUseAbility`; the revive branch in `canStillAct`; the camouflage break roll; the three new effect branches of `abilityEvents`; the prone walk and the shared `turnEndEvents` helper |
| `backend/engine/src/events.ts` | modify | `cloneState` deep-clones the status and the terrain; `moved` applies `rngState`/`prone` and pays difficult steps; `ability-used` applies camouflage and terrain; the new event cases; `turn-ended` halves the incoming prone unit's movement and decrements the actor's camouflage; `unit-defeated` clears the statuses |
| `backend/engine/src/movement.ts` | modify | `isDifficult(state, cell)`; `stepCost` takes a `difficult` flag and doubles the full cost; `walkFrom` reads the terrain; `requireWalk`'s caller passes the state; comments that a step may cost more than 2 |
| `backend/engine/src/initiative.ts` | modify | `insertIntoInitiative(state, unitId)` — speed desc, setup-index tie |
| `backend/engine/src/match.ts` | modify | `validateCatalog` switches on all five kinds and validates their fields; `toUnitState` opens `camouflage: null`, `prone: false`; `newMatch` opens `difficultTerrain: []` |
| `backend/engine/src/camouflage.test.ts` | create | Section 4 |
| `backend/engine/src/terrain.test.ts` | create | Section 4 |
| `backend/engine/src/revival.test.ts` | create | Section 4 |
| `backend/engine/src/match.test.ts` | modify | Catalog validation for the new kinds |
| `backend/engine/src/events.test.ts` | modify | Replay of the new events and the malformed cases |
| `backend/engine/src/initiative.test.ts` | modify | The insertion order |
| `backend/engine/src/movement.test.ts` | modify | Difficult steps, climbs and the search agreeing with replay |
| `backend/engine/src/actions.test.ts` | modify | `target-hidden`, the `moved` payload and the new turn-end order |
| `backend/engine/src/properties.test.ts` | modify | The generators sometimes use the new abilities; integer-only and replay invariants |
| `backend/engine/src/hash.test.ts` | modify | Each new status and the terrain changes the hash; key order does not |
| `backend/engine/src/forbidden.test.ts`, `no-node-deps.test.ts` | no change | Run them: the new code imports no framework and no I/O |

## 3. Contract of the layer

### 3.1 The types

```ts
export type AbilityEffect =
  | { kind: 'damage'; amount: number; radius: number; ignoresCover: boolean }
  | { kind: 'heal'; amount: number; radius: number }
  | {
      kind: 'camouflage';
      /** The caster's own cell only; the field keeps every effect answering `radius`. */
      radius: 0;
      /** The caster's own turns the status lasts, the turn it was cast included. */
      turns: number;
      /** Integer percentage, 0..100, of the status ending on a damaging action. */
      breakChance: number;
    }
  | {
      kind: 'terrain';
      /** Chebyshev radius of the cast; 1 is a 3×3 square. */
      radius: number;
      /** Rounds the cells stay difficult, counted from the round of the cast. */
      durationRounds: number;
    }
  | { kind: 'revive'; /** The destination cell only. */ radius: 0 };

/** The status a camouflage cast writes onto its caster. */
export interface Camouflage {
  turns: number;
  breakChance: number;
}

/** One cell of difficult terrain and the round in which it dries up. */
export interface DifficultCell {
  position: Position;
  expiresAtRound: number;
}
```

`UnitState` gains `camouflage: Camouflage | null` and `prone: boolean`. `MatchState` gains
`difficultTerrain: DifficultCell[]`; `PublicState` inherits it through `Omit<MatchState, 'rng'>`.
`newMatch` opens `camouflage: null`, `prone: false` and `difficultTerrain: []`, so a replay from an
old setup still builds a complete state.

Every effect carries `radius`, which is what lets `abilityCells` stay unchanged: camouflage and
revival use 0, terrain uses its own value. The catalog validator requires exactly 0 for the two
single-cell kinds, a positive `turns`, a `breakChance` in 0..100 and a positive `durationRounds`.

### 3.2 The action and the refusals

```ts
| { type: 'useAbility'; actor: UnitId; abilityId: string; to: Position; target?: UnitId }
```

`target` is read only by a `revive` effect. It names the fallen ally; `to` names the free cell it
appears on. A `target` sent with any other kind is ignored — the aim is still the cell, as ADR 0016
settled. The refusals of a use, in order:

1. `already-acted`;
2. `ability-unknown` (the id is not in either active set, or no definition carries it);
3. the pool refusal (`no-mana` / `no-ammunition`);
4. `out-of-bounds` for `to`;
5. `target-out-of-range` from the caster to `to`;
6. `no-line-of-sight` when the definition needs it;
7. for `revive` only: `target-invalid` when `target` is absent, unknown, an enemy, alive, or
   permanently dead;
8. for `revive` only: `cell-occupied` when `to` holds a living unit or a body (including the chosen
   ally's own body).

A basic attack against a living enemy whose `camouflage` is not null is refused with
`target-hidden`. The check sits after the target/team validity and before the pool, range and sight,
so the player learns the real reason even when the hidden target is also far away. No other action
is refused because of camouflage.

### 3.3 Camouflage

- The `ability-used` event of a `camouflage` effect sets the caster's `camouflage` to
  `{ turns: effect.turns, breakChance: effect.breakChance }`. It spends the cost and the action like
  any use, rolls nothing, and refreshes the status when it is already active.
- At the end of each of the caster's own turns, `applyEvent('turn-ended')` decrements
  `camouflage.turns`. When the turn that takes it to zero ends, the builder emits
  `camouflage-ended { target: caster, reason: 'expired' }` right after the turn events; the event
  clears the status. Three turns therefore cover the activation turn and the two following ones.
- Every basic attack and every `damage` ability used by a camouflaged unit rolls
  `nextInt(rng, 1, 100) <= breakChance` before the action's own rolls (I4). The action resolves
  normally, hit or miss, and the builder emits `camouflage-ended { target: attacker, reason:
  'broken' }` after the action's damage and defeats. The `attacked`/`ability-used` `rngState` covers
  the break roll and the action's rolls, so replay never rolls again.
- A heal, a camouflage recast, a terrain cast and a resurrection do not roll the break (P5).
- A basic attack against the camouflaged unit is refused; a `damage` ability aimed at its cell still
  reaches and damages it (2A). The unit is still a normal unit for movement, healing, areas and
  occupancy: camouflage changes targeting eligibility alone.
- `unit-defeated` clears the status. A body never carries it.

### 3.4 Difficult terrain, the walk and prone

- A `terrain` cast writes one `DifficultCell` per `abilityCells(state, to, ability)` with
  `expiresAtRound = round + durationRounds`. A cell already in the list is refreshed in place; it is
  never duplicated (I2). The cast can cover occupied cells; it changes no occupancy.
- `isDifficult(state, cell)` is true when the list holds the cell. `stepCost(profile, board, from,
  to, difficult)` returns `(1 + climbCost * max(0, climb)) * 2` when the **destination** is
  difficult, and the existing value otherwise (P3, 5A). `walkFrom` and `requireWalk` both read the
  same predicate; the search and replay cannot disagree.
- The round rise removes every cell with `expiresAtRound <= round` and emits
  `terrain-expired { cells }`; the event removes exactly those cells. The round rise is the one the
  `turn-ended` event already carries. Nothing else removes terrain.
- A move entering a difficult cell rolls `nextInt(rng, 1, 100) <= 20` once per entering step. On a
  success the walk stops **on that cell**: the `moved` event's `path` and `to` are truncated there,
  the unit pays only those steps, `prone` is true, and the builder appends the turn-end events for
  the actor (6A). On a failure the walk continues and the next entering step rolls again. A move that
  starts on mud but enters no mud cell rolls nothing (P4).
- The `moved` event gains `rngState` (the random source after the walk's rolls) and `prone`. Replay
  applies the rng state and sets `actor.prone = true` when the flag is set; it never re-rolls (I5).
- The actor's turn ends immediately after a prone stop. `pendingMove` is cleared by the `turn-ended`
  event, as any non-move event clears it; the unit cannot cancel or confirm the run.
- `applyEvent('turn-ended')` sets the incoming unit's `movementLeft` to `floor(movement / 2)` when it
  is prone and to `movement` otherwise. The builder emits `stood-up { actor: incoming }` after
  `turn-ended` when the incoming unit was prone; the event clears `prone`. The unit therefore loses
  the turn it fell and the next one starts standing, at half movement, with a normal action (7A).
- A prone unit is otherwise ordinary: it occupies its cell, can be attacked and healed, and is
  visible to the rules. Only the client rotates the figure.
- The turn-end event order is fixed and shared by `endTurn` and the prone stop:
  `turn-ended` → `stood-up` (if the incoming unit was prone) → `terrain-expired` (if the round rose
  and cells dried) → `camouflage-ended` (if the actor's status expired) → `regained` →
  `corpse-removed`.

### 3.5 Resurrection

- The action names the fallen ally in `target` and the destination in `to`. The body must be on the
  map: the ally is `defeated` and not `permanentlyDead`. The destination must be in bounds, within
  the definition's range (3), in no need of sight, and empty of living units **and** bodies (ADR
  0003, 8A). The body may be anywhere on the map (I3): the range is read to the destination, which
  is what the pitch's two-step rule says.
- The builder emits `ability-used { ..., target }` and then `revived { target, to }`. The
  `ability-used` event pays the cost, faces the caster and spends the action as usual.
- `applyEvent('revived')` clears `defeated` and `permanentlyDead`, clears `corpseExpiresAtRound`,
  restores `health = maxHealth`, moves the unit to `to`, clears `camouflage` and `prone`, and
  re-inserts it into the initiative by speed (ties by setup index). The pool (`ammo`) is untouched:
  the unit returns with what it had at death (9A). The body is consumed because the same unit is
  alive again at another cell; no `corpse-removed` event is emitted.
- The insertion index is returned and compared with `currentIndex`. If it is at or before the
  current index, the current index is incremented so the unit on turn stays on turn; the revived
  unit's slot has passed this round. If it is after, the unit may act in the current round (10A).
- Game over is still immediate: `validateAction` refuses every action once either team has no living
  unit. Resurrection is therefore usable only while the Priest is alive; if the Priest is the last
  living unit, it works; if the Priest dies, the match is over and nothing waits (11A).
- `canStillAct` must not use only the caster's own cell for a revive, which is occupied and would
  answer `cell-occupied`. For a `revive` definition it walks the fallen allies and the free cells in
  range and returns true when any `validateUseAbility` pair is legal.

### 3.6 Determinism and what this layer does not do

Every new roll is already carried by an event: the break rolls and the effect rolls in
`attacked.rngState`/`ability-used.rngState`, the prone rolls in `moved.rngState`. Every new state
change goes through `applyEvent`. `publicState` and `hashState` include the new fields automatically
because they are plain data. `cloneState` deep-copies `camouflage` and every `DifficultCell`.

This layer does **not**: author the definitions, choose class slots, run the bot, change the protocol
constants, draw anything, persist statuses or terrain, or add a new game-over rule. It also does not
migrate stored replays (index I10).

## 4. Planned tests

### Camouflage (`camouflage.test.ts`)

- [ ] A cast spends its cost, sets `turns`/`breakChance`, leaves the rng untouched and emits only
      `ability-used`.
- [ ] A basic attack against a camouflaged enemy is refused with `target-hidden`, with no event and
      no state change.
- [ ] A `damage` ability aimed at the camouflaged unit's cell damages it when the roll lands; a heal
      and a terrain cast aimed at the cell do not break the status.
- [ ] A seeded basic attack whose break roll succeeds (one that hits and one that misses) resolves
      normally, pays ammo, emits `camouflage-ended { reason: 'broken' }` after the hit/defeat, and a
      replay lands on the same rng state and the same final hash.
- [ ] A seeded `damage` ability whose break roll succeeds behaves the same, with the break in the
      `ability-used.rngState`.
- [ ] A camouflaged unit's heal, terrain cast, revive and camouflage recast do not roll the break.
- [ ] Three of the caster's own turns decrement the status to zero and emit
      `camouflage-ended { reason: 'expired' }`; a turn of anybody else does not decrement it.
- [ ] A recast refreshes the three turns.
- [ ] `unit-defeated` clears the status; a body carries none.
- [ ] `hashState` distinguishes camouflaged from not, and a key-order shuffle hashes the same.

### Terrain and prone (`terrain.test.ts`)

- [ ] A cast writes the 3×3 cells with `expiresAtRound = round + 3`, clipped at the board, and emits
      only `ability-used`.
- [ ] A recast on the same cells refreshes each expiry and adds no duplicate; a non-overlapping cast
      keeps both areas.
- [ ] At the default profile a flat step into mud costs 2, a one-level climb costs 4 and a two-level
      climb (profile `maxStepUp: 2`) costs 6; a step out of mud costs 1.
- [ ] `reachableCells`/`findPath` agree with the cost `moved` pays; the replay of the path pays the
      same and throws on a path that does not.
- [ ] Allies, enemies and the caster all pay the doubled cost.
- [ ] A seeded walk whose first entering roll succeeds stops on that cell: the `moved` path is
      truncated, `prone` is true, the turn ends, and the next unit's turn begins.
- [ ] A seeded walk whose rolls fail continues to the destination with `prone: false` and the full
      path.
- [ ] A move that starts on mud and enters no mud cell rolls nothing.
- [ ] A prone unit's next turn starts standing, with `floor(movement / 2)` and a normal action;
      `stood-up` is emitted; the unit can act that turn.
- [ ] A unit defeated while prone loses the status with the body.
- [ ] At the start of round R+3 the cells dry up, `terrain-expired` carries exactly them, and a walk
      pays the normal cost afterwards.
- [ ] A prone stop that wraps the round emits the terrain expiry in the fixed order.
- [ ] Replay of a cast, several walks, a prone stop and an expiry gives the same final hash as live
      play.

### Resurrection (`revival.test.ts`)

- [ ] A legal revive spends 3 mana, consumes the action, emits `ability-used` then `revived`, places
      the unit on `to`, restores full HP, keeps `ammo` as it was at death, and consumes the body.
- [ ] The unit is re-inserted by speed (setup-index tie); it acts in the current round when its slot
      is after the current index and waits for the next round when it is before.
- [ ] The revived unit clears `prone` and `camouflage`.
- [ ] Refusals: no `target`, an enemy target, a living target, a permanently dead body, `to` out of
      bounds, `to` past range 3, `to` holding a living unit, `to` holding any body, an empty mana
      pool, `already-acted` — each with no event and no state change.
- [ ] With only the Priest alive and a body on the map, the revive is legal. When the Priest dies,
      `isGameOver` is true and every action is refused with `game-over`; there is no waiting.
- [ ] `canStillAct` is true for a Priest whose only legal action is a revive, and false when no body
      or no free cell exists.
- [ ] Replay of a revive gives the same final state and hash.

### Cross-cutting

- [ ] `validateCatalog` accepts all five kinds and rejects a camouflage radius other than 0, a
      zero `turns`, a `breakChance` outside 0..100, a zero `durationRounds` and a revive radius
      other than 0.
- [ ] `events.test.ts` replays a `moved` with a truncated path and the `rngState`/`prone` fields,
      and rejects a path that is not contiguous or costs more than the movement left.
- [ ] `properties.test.ts` generates matches that use the new abilities without a non-integer value,
      and every generated match replays to its own hash.
- [ ] `forbidden.test.ts` still passes: no new module imports Node or a framework.
- [ ] `hash.test.ts` distinguishes terrain, camouflage and prone states; array order of the terrain
      is deterministic.

## 5. Dependencies

- **ADR 0023 accepted first.** The engine changes must not land before the record that decides them.
- No other milestone. The definitions, the class slots and the protocol are m2's; the client is m3
  and m4.

## 6. Out of scope

- The `ABILITY_CATALOG` entries, the class slots, the bot and protocol 11 (m2).
- The client menu, aim, log and drawing (m3, m4).
- Reactions, Silence and the rest of the pitch's ability list; board mutation; other terrain kinds;
  forced movement; cooldowns; partial-HP revival; a revival after the Priest's death; a delayed game
  over; replay migration; persistence.
