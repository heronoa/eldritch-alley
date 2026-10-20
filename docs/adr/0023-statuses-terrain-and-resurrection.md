# 0023. Statuses, difficult terrain and resurrection

**Status:** Accepted (2026-10-17). Amends ADR 0016 decision 2 (the effect union has more than two
kinds), its decision 6 (both active sets are read) and its board-immutability consequences (terrain is
state, not a board edit). It records the two-step resurrection ADR 0003 and the pitch define. ADR 0016
itself is not rewritten.

## Context

Each class carries one active ability and a second, empty slot. The next content pass fills the second
slot with a different kind of play: the Sniper disappears from the basic-attack targeting rules, the
Wizard makes ground expensive and can knock a walker down, and the Priest brings an ally back while the
body is still on the map.

The engine is still the authority over every action, deterministic and integer-only (ADR 0005). It knows
no class and no ability name (ADR 0016 decision 1), so the three tricks have to arrive as data: new
effect kinds and new state the rules read. Two of them are not effects on a unit at the moment of the
cast — camouflage lasts for turns, mud lasts for rounds — so the match state has to carry them and the
replay has to rebuild them from events.

## Decision

1. **Both active sets are read.** A unit may use any id in `activeSets[0]` or `activeSets[1]`; an id in
   neither is `ability-unknown`. The remaining slots (`reaction`, `movement`, `support`) stay unread,
   exactly as ADR 0016 left them.
2. **Three effect kinds join the union.** They are plain data, and every one of them carries `radius`,
   so `abilityCells` keeps its single implementation:

   ```ts
   export type AbilityEffect =
     | { kind: 'damage'; amount: number; radius: number; ignoresCover: boolean }
     | { kind: 'heal'; amount: number; radius: number }
     | { kind: 'camouflage'; radius: 0; turns: number; breakChance: number }
     | { kind: 'terrain'; radius: number; durationRounds: number }
     | { kind: 'revive'; radius: 0 };
   ```

   The catalog validator requires a radius of exactly zero for `camouflage` and `revive`, a positive
   `turns`, a `breakChance` in 0..100 and a positive `durationRounds`. A broken catalog still fails at
   `newMatch`, before a match can start.
3. **Status and terrain live in the match state.** `UnitState` gains `camouflage: Camouflage | null` and
   `prone: boolean`; `MatchState` gains `difficultTerrain: DifficultCell[]`. `newMatch` opens them at
   `null`, `false` and `[]`. They are plain data like the rest of the state: `publicState` copies them,
   `hashState` fingerprints them and `applyEvents` rebuilds them from events alone. No table, no board
   mutation and no migration: a terrain square is a cell with an expiry, not a different map.
4. **Difficult terrain doubles the full step cost, climbs included.** A cell is difficult while the list
   holds it; a cast writes one cell per covered square with `expiresAtRound = round + durationRounds`.
   A cell already covered is refreshed in place and never duplicated. `stepCost` reads the destination
   cell: flat 2, a one-level climb at the default profile 4, a two-level climb 6. The movement search
   and the replay call the same predicate, so the cells the client paints and the cost the engine
   charges cannot disagree. Terrain expires on the round rise the `turn-ended` event carries.
5. **Prone is caused by entering mud.** Every step that enters a difficult cell rolls 20 %; a walk that
   starts on mud and enters none rolls nothing. On a success the walk stops on that cell and the turn
   ends immediately: the engine truncates the path, pays only those steps and sets `prone`. On its next
   turn the unit starts standing, with half its movement rounded down and a normal action. Everyone —
   the caster and its allies included — pays the doubled cost and rolls. A prone unit is otherwise
   ordinary: it occupies, can be attacked and healed, and only its sprite changes.
6. **Camouflage is untargetable by basic attacks and broken by its own attacks.** A basic attack against
   a living, camouflaged enemy is refused with `target-hidden`; a damaging ability still reaches the
   cell and hits it. The status lasts the caster's own `turns`, the activation turn included, and is
   decremented when that unit's `turn-ended` event is applied; reaching zero emits
   `camouflage-ended { reason: 'expired' }`. Every basic attack and every `damage` ability the
   camouflaged unit uses rolls `breakChance` before the action's own rolls, hit or miss; the action
   resolves normally and `camouflage-ended { reason: 'broken' }` follows the damage and defeats. Heals,
   terrain casts, revives and recasts do not roll. A defeat clears the status; a body never carries it.
7. **Resurrection is one action with a target and a destination.** The action gains an optional
   `target` that names the fallen ally; `to` names the free cell it appears on. The ally must be
   `defeated` and not `permanentlyDead`, and the body may be anywhere on the map — the range is read to
   the destination, which is the pitch's two-step rule. The destination must be in bounds, within range,
   and empty of living units **and** bodies. The unit returns at full HP with its pool exactly as it was
   at death; its statuses are cleared and the body is consumed because the same unit is alive again. It
   re-enters the initiative by speed, ties by setup order. The unit acts in the current round when its
   slot lies after the current one; otherwise the current index moves with it and the unit waits for the
   next round. Game over stays immediate: resurrection works only while the Priest is alive, and a match
   that has ended refuses every action, the revive included.
8. **Every new roll is in an event, and replay never rolls again.** The break rolls travel inside
   `attacked.rngState` and `ability-used.rngState`; the prone rolls travel inside a new `moved.rngState`,
   which also carries `prone`. The new events are `camouflage-ended`, `stood-up`, `terrain-expired` and
   `revived`. The turn-end order is fixed and shared by a passed turn and a prone stop:
   `turn-ended` → `stood-up` → `terrain-expired` → `camouflage-ended` → `regained` → `corpse-removed`.
9. **The protocol rises to 11.** The client action gains the optional `target`, the state gains
   `camouflage`, `prone` and `difficultTerrain`, the event union gains the four events, `moved` gains
   `rngState` and `prone`, and the refusal union gains `target-hidden`. The client mirrors and the
   server rejection rule travel with the server milestone.
10. **The engine still knows no class or ability name.** The three abilities are catalog entries authored
    by the server, and every rule above is written against effect data and unit state.

## Consequences

- The existing three abilities keep their behaviour. The only change to an existing action is the
  optional `target`, ignored by every kind except `revive`.
- `moved` events recorded before this record are a different shape. No stored replay is re-verified and
  the history screen lists summaries only, so old matches are left as they were recorded; new matches
  carry the new payload.
- The hash of every state changes, because the state gained fields. Two matches built by the same setup
  and the same events still hash the same.
- `cloneState` deep-copies the status and every difficult cell, so an event never aliases the state it
  was applied to.
- The layer authors no definitions, chooses no class slot, runs no bot, changes no protocol constant and
  draws nothing. Those belong to the server and client milestones of the same delivery.
