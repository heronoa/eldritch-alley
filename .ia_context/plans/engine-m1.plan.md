# Plan — Minimal deterministic engine (M1)

**Milestone:** — (single layer: `backend/engine`)
**Parent feature:** M1 in [ROADMAP.md](../../ROADMAP.md)
**Created on:** 2026-10-03
**Status:** approved for execution via `/apply-plan` on 2026-10-03. Open points confirmed: movement budget from unit data; turn model with explicit `endTurn`; `applyEvents(setup, events)`.

---

### 1. Objective

Deliver the minimal battle engine: an 8×8 grid with height levels, movement with cost, initiative, a basic attack with range, a seeded random source, an event log, and a function that rebuilds the final state from the setup and the events. The public contract is what the match server (M2) will call. Nothing in this milestone depends on a framework, I/O, the clock or `Math.random`.

### 2. Decisions taken for this plan

These come from the accepted ADRs and from the answers recorded for M1.

| Topic | Decision | Source |
|---|---|---|
| Turn order | One unit acts per turn, ordered by speed | ADR 0001 |
| Speed ties | Insertion order: team A before team B, then position in the squad list | Answer for M1 |
| Resources | Not in M1. Ammunition and mana come in M3 | ADR 0002, roadmap |
| Death | Unit at zero health is marked `defeated`, stays in state, and leaves the initiative queue. Resurrection stays possible later as a Priest ability | ADR 0003, post-MVP specs |
| Visible state | `publicState(state)` omits the rng. The server sends only the public view to clients | Post-MVP specs (hidden information) |
| Events per action | An accepted action produces one or more events, so reactions can add events later. Reaction windows are not implemented in M1 | Post-MVP specs (reaction abilities) |
| Hit resolution | Hit chance goes through `resolveHit(attacker, target, rng)`, not `unit.hitChance` directly, so Nerve can change it later without changing the state shape | Post-MVP specs (Nerve) |
| Math | Integer only; no clock, no `Math.random`; randomness only from the seed | ADR 0005 |
| PRNG | mulberry32, implemented in the engine | Answer for M1 |
| Movement cost | Each cell costs 1; climbing one level adds 1; descending adds 0; at most one level per step | Answer for M1 |
| Movement action | A `move` is one step to an adjacent cell (Chebyshev distance 1). It spends movement but not the unit's action. Multi-cell paths are built from several moves | Plan correction, to make the rules testable without pathfinding |
| Movement budget | Unit field `movement`, per turn, read from unit data | Confirmed at approval |
| Attack range | Unit field `range`, Chebyshev distance. Fixture value 1 in M1 (basic attack) | Plan correction: data-driven, needed by Sniper later |
| Attack resolution | Hit roll as an integer percentage using the seed; damage is a fixed integer per unit | Answer for M1 |
| Rejected actions | Return `{ ok: false, reason }`; no event is produced; state is unchanged | Answer for M1 |
| State hash | FNV-1a, 32 bits, over a canonical serialization of the state | Default, to confirm with approval |

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `backend/engine/src/index.ts` | modify | Re-exports the public API. `ENGINE_VERSION` stays |
| `backend/engine/src/types.ts` | create | Types: `Position`, `Unit`, `Team`, `MatchSetup`, `MatchState`, `Action`, `Event`, `ActionResult`, `RejectReason` |
| `backend/engine/src/rng.ts` | create | mulberry32 generator: `createRng(seed)`, `nextInt(rng, min, max)`, state is a plain object |
| `backend/engine/src/board.ts` | create | Grid of 8×8 cells with integer height levels; `levelAt`, `inBounds`, `distance` (Chebyshev) |
| `backend/engine/src/initiative.ts` | create | Builds the queue by speed with insertion-order tie-break; removes dead units; advances to the next unit |
| `backend/engine/src/actions.ts` | create | Validation and application of `move`, `attack` and `endTurn`; `resolveHit(attacker, target, rng)`; returns `ActionResult` |
| `backend/engine/src/events.ts` | create | Event shape and `applyEvent(state, event)`, used by live play and by replay alike |
| `backend/engine/src/match.ts` | create | `newMatch(setup)`, `applyAction(state, action)`, `applyEvents(setup, events)`, `hashState(state)` |
| `backend/engine/src/hash.ts` | create | FNV-1a 32-bit and the canonical serialization used by `hashState` |
| `backend/engine/src/forbidden.test.ts` | create | Guard test: reads the engine sources and fails on `Math.random`, `Date`, `process`, `require(`, `node:`, `setTimeout` or floating-point division |
| `backend/engine/src/*.test.ts` | create | One test file per module, plus property tests (see section 5) |

Test fixtures (small maps and two-unit squads) live inside the test files. No concrete classes, maps or balance values are added in M1.

### 4. Contract

**Setup and state**

- `MatchSetup` = `{ seed: number; map: Board; teams: [Squad, Squad] }`, where each unit has `id`, `team`, `position`, `speed`, `health`, `attack` (fixed integer damage) and `hitChance` (integer percentage). `Board` is 8×8 with integer heights.
- **Unit data constraint (post-MVP readiness).** The `Unit` type must already carry, as plain data, the fields needed by the post-MVP progression described in the pitch, so the types do not need to be redesigned later:
  - `nerve`: integer 0..100.
  - `attunement`: integer 0..100.
  - `primaryClass`: a class id from the class data (a base class or an advanced one).
  - `equipment`: `{ armor, helmet, mainHand, offHand, accessory1, accessory2 }`, each an item id or `null`.
  - `abilities`: `{ activeSets: [setA, setB], reaction, movement, support }`, each an ability id or `null`; `activeSets` always has two entries.

  In M1 these fields are fixed per class by the test fixtures, and all equipment and ability slots are empty or fixture values. No rule reads them: M1 implements no Nerve or Attunement effects, no class progression, no hand rules, no ammunition from dual wielding, and no ability types beyond the basic attack. `newMatch` checks only that the values have the right type and range; it does not check the sum cap (120), because that is a progression rule for later.
- `newMatch(setup): MatchState`. Throws `RangeError` for invalid setups only (duplicate positions, out-of-bounds positions, non-integer values, seed not an unsigned 32-bit integer). Rule violations are never exceptions.
- `MatchState` is plain data: units, board, initiative queue, current unit, remaining movement, whether the unit has acted, rng state, and the event count.

**Actions**

- `applyAction(state, action): ActionResult`, where `ActionResult` is `{ ok: true; state; events: Event[] }` or `{ ok: false; reason }`.
- `Action` = `{ type: 'move'; actor: UnitId; to: Position } | { type: 'attack'; actor: UnitId; target: UnitId } | { type: 'endTurn'; actor: UnitId }`. The engine rejects with `not-your-turn` when `actor` is not the current unit. The server maps each session to its units and sends the actor; the engine enforces the turn, as the pitch requires.
- `RejectReason` is a closed string union: `not-your-turn`, `out-of-bounds`, `cell-occupied`, `height-step-too-high`, `not-enough-movement`, `already-acted`, `target-out-of-range`, `target-invalid`, `not-adjacent`, `game-over`. Checks run in this order: game over, turn, out of bounds, not adjacent, occupied, height step, movement, action spent, target checks.

**Events**

- Each accepted action produces one or more events, in order: `moved`, `attacked`, `unit-defeated` or `turn-ended`. In M1 an action produces one event, except when a defeat is added to an attack: then `attacked` is followed by `unit-defeated`. The list format is what lets reactions add events later. `attacked` carries `hit: boolean`, `damage` (0 when missed) and `rngState`: the random source after the roll. `applyEvent` takes `rngState` as it is, so a replay rolls exactly as the live match does, even when a roll takes several draws (see the rejection sampling in `rng.ts`). Turn changes are explicit in `turn-ended`.
- `applyEvent(state, event): MatchState` is the single place where state changes. `applyAction` calls it on each new event, so live play and replay use the same code.
- `applyEvents(setup, events): MatchState` = `newMatch(setup)` followed by `applyEvent` for each event.

**Public view**

- `publicState(state): PublicState` returns the state without the rng. The server sends only this to clients. The rng state, and therefore the outcome of future rolls, never leaves the server.

**Hash**

- `hashState(state): number` returns an unsigned 32-bit integer. It serializes the state in a fixed key order and runs FNV-1a over it.

**What this layer does not do**

- No line of sight, cover, facing bonus, height advantage, ammunition, mana, abilities, or class definitions.
- No match timers, no PvP rules, no reconnection, no persistence, no network.
- No randomness outside `rng.ts`; no clock.

### 5. Tests planned

Run with `npm test` in the engine workspace. The file names follow the modules.

**rng**
- [x] Same seed produces the same first 16 values; a fixed reference sequence is asserted for seed 1.
- [x] Different seeds diverge within the first values.
- [x] `nextInt` stays inside the inclusive range and returns integers only.

**board**
- [x] `inBounds` accepts 0..7 and rejects -1 and 8.
- [x] Chebyshev distance: diagonal = 1, straight = 1, two cells away = 2, distance is symmetric.

**initiative**
- [x] Higher speed acts first.
- [x] Equal speed: team A before team B, then list position.
- [x] A defeated unit leaves the queue, and the queue skips to the next unit.

**actions: move**
- [x] Valid move on flat ground costs 1 per cell; the event and the remaining movement are correct.
- [x] Climbing one level costs 1 extra; descending costs no extra.
- [x] Climbing two levels in one step is rejected with `height-step-too-high`.
- [x] Moving into an occupied cell is rejected with `cell-occupied`.
- [x] Moving beyond the remaining movement is rejected with `not-enough-movement`.
- [x] Moving out of bounds is rejected with `out-of-bounds`.
- [x] A non-current unit cannot act: `not-your-turn`.

**actions: attack**
- [x] Target at Chebyshev distance 1 is accepted; distance 2 is `target-out-of-range`.
- [x] A hit with a seeded roll applies `attack` damage and records `hit: true`.
- [x] A miss records `hit: false` and `damage: 0`.
- [x] A unit with zero health is marked `defeated`, stays in `state.units`, and is removed from the initiative queue (ADR 0003).
- [x] Attack that defeats a unit returns `attacked` followed by `unit-defeated`, in that order.
- [x] Hit chance is computed by `resolveHit`: with the same seed, changing only the attacker's accuracy input changes the hit result, and the state shape stays the same.
- [x] Attacking a dead or unknown target is rejected with `target-invalid`.
- [x] A second action in the same turn is rejected with `already-acted`.

**actions: endTurn and game over**
- [x] `endTurn` produces `turn-ended` and the next unit becomes current.
- [x] When one team has no units left, actions return `game-over`.

**rejections**
- [x] Every rejection returns `{ ok: false, reason }`, produces no event, and leaves the state object unchanged.

**events and replay**
- [x] `applyEvents(setup, events)` after a sequence of accepted actions gives the same hash as the live state.
- [x] A rejected action does not appear in the event list, and replay still matches.

**hash**
- [x] FNV-1a matches reference vectors for known strings.
- [x] Changing one unit's health changes the hash.
- [x] Object key order does not change the hash (canonical serialization). Unit order in `state.units` is state, because it is the speed tie-break, so reordering units does change the hash.

**public view**
- [x] `publicState(state)` has no `rng` field, and its other fields equal the corresponding fields of `state`.
- [x] Two states that differ only in rng state produce the same `publicState`.

**properties (fast-check is not added; a seeded generator drives the cases)**
- [x] For 200 seeds, a random sequence of candidate actions drawn from the same seeded generator: every accepted sequence replays to the same hash, and every rejection leaves the hash unchanged.
- [x] All numeric results (distance, cost, damage, hit roll) are integers across these runs.

**guard**
- [x] `forbidden.test.ts` fails if any engine source contains a forbidden global or a floating-point division.

Each rule above has at least one test that fails without the rule implemented. The plan asked for these tests to be red before the implementation existed. That order was not recorded, so it cannot be shown now. The retroactive check is in section 9.

### 6. Dependencies

- M0 approved and merged: yes (CI green on `develop`, run 37134898835).
- No dependency on other workspaces. The engine does not import from `game-server` or `platform-api`.
- Recommended branch: `feature/engine-m1`, created from `develop` by Heron.

### 7. Out of scope

- Line of sight, cover, facing bonus, height advantage, resources, abilities, concrete classes, maps beyond test fixtures: moved to M3, per the roadmap.
- The bot, the match room, PvP, the timer (ADR 0004), replay UI, persistence, and the client: M2 and later.
- Balance values. Numbers in tests are fixtures, not design. Real values come with M3 playtesting.
- Turn model details beyond the list above (for example, whether a unit can act before moving) follow the rule in section 2: move first, then one action, then `endTurn`. This is an assumption to confirm at approval.

### 8. Points to confirm at approval

1. **Movement budget per turn.** The plan uses a fixture value in tests (for example 4). The real value per class comes in M3. Confirm that the engine takes the budget from the unit's data, not a constant.
2. **Turn model.** Move, then one action, then `endTurn`. The alternative is to end the turn automatically after the action. The plan uses the explicit `endTurn`.
3. **`applyEvents` signature.** The roadmap wrote `applyEvents(seed, events)`. The plan takes `applyEvents(setup, events)`, because the initial map and units cannot be rebuilt from the seed alone. The setup carries the seed.

### 9. Verification record

**Checklist.** Every item in section 5 is marked. Each one maps to a test in `backend/engine/src`:

- rng, board, initiative, move, attack, endTurn, game over, rejections, events and replay, hash, public view, properties, guard: the test files of the same names.
- The "same hash as the live state" and "rejected actions are not in the event list" items are covered by `properties.test.ts`, which compares the full state after replay and only ever replays accepted events.
- The "integers only" item covers distance, cost and damage in `properties.test.ts`, and the hit roll in `rng.test.ts`, because the roll is internal and is never returned as a value.

**Red check, run retroactively on 2026-10-03.** The implementation files were moved out of `src` and the suite was run. All 10 test files failed with `Cannot find module` (for example `./actions`, `./board`, `./events`, `./hash`), so the tests depend on the implementation and cannot pass without it. The files were then restored, and the suite passed again.

**What this does not prove.** It does not show that each test was red before its rule was written. The order of creation was not recorded, and the retroactive check cannot recover it. Future milestones should record the red run as it happens.

**Changes made after the first implementation, all covered by tests:**
- Replay applies the random source recorded in `attacked` (`rngState`). Before this, a rebuilt match rolled differently from the live match. Covered by `properties.test.ts`.
- Rolls use rejection sampling, so they have no modulo bias. Covered by `rng.test.ts`.
- `nextInt` rejects empty ranges and non-integer bounds. Covered by `rng.test.ts`.
- `newMatch` rejects empty teams and duplicate unit ids. Covered by `match.test.ts`.
- Movement after the action is spent is rejected with `already-acted`. Covered by `actions.test.ts`.
- The `unit-defeated` event field is `target`, matching `attacked`. Covered by `actions.test.ts` and `events.test.ts`.
