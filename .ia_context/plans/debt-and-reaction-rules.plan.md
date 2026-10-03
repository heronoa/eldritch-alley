# Plan — Technical debt fixes and reaction and resurrection rules

**Milestone:** — (documentation, one engine change, lockfile; does not start M3)
**Parent feature:** [technical-debt.md](../inputs/technical-debt.md)
**Created on:** 2026-10-03
**Status:** applied on 2026-10-03. Checklist verified by tests; see section 6.

---

### 1. Objective

Fix the technical debts that can be fixed now, and record two game rules that the next milestones will implement: reaction abilities and two-step resurrection. The rules become decisions in ADRs and pitch sections. No reaction or resurrection code is written in this plan.

### 2. Decisions taken for this plan

These come from the answers given while drafting the plan.

| Topic | Decision | Source |
|---|---|---|
| What a reaction is | An ability that triggers during another unit's action, not during the unit's own turn. It costs reaction slots | Owner's spec |
| Reaction slots | Determined by Nerve, minimum 3. Higher Nerve means more slots. Computed from a table of bands, stored as data | Answer: table by bands |
| Slot refresh | At the start of the unit's own turn | Answer |
| Slot cost | Every reaction costs 1 slot for now. Skills that spend more or fewer slots come later, as data | Owner's spec |
| Interrupting an action | The engine pauses in a reaction window. The target player accepts or declines before the action resolves. The response is an event, so replay stays deterministic | Answer: pause with reaction window |
| Resurrection | Two steps: (1) choose the defeated character; (2) choose a tile that is empty and unoccupied, within the caster's ability range | Owner's spec; answer on range |
| Class name | "Initiated" stays. The owner's spec wrote "Initiate", and that name is not used | Answer |
| Dependency fixes | `npm audit fix` without `--force`. Only fixes that do not cross a major version | Answer |
| Corpse | A defeated unit's body stays on its tile for a number of rounds that depends on Nerve. The body occupies the tile during that time. When the time ends, the body disappears, an item appears in its place (post-MVP), and the character is permanently dead. The death record is kept in the database, not deleted | Owner's spec |
| Early end | If the match ends before the rounds run out, or the unit is revived, the body is removed and the unit returns to its team as usual | Owner's spec |
| Round | One round is one full pass of the initiative queue. It is counted when the turn wraps back to the first unit | Plan decision, to confirm |

**Slot bands (confirmed by the owner):** Nerve 0–24 → 3 slots; 25–49 → 4; 50–74 → 5; 75–99 → 6; 100 → 7. Values are data, so balancing changes the table, not the code.

**Corpse durations (confirmed by the owner):** Nerve 0–49 → 3 rounds; 50–99 → 4 rounds; 100 → 5 rounds.

**Corpse rule location (decided by the owner): now, in M1.** This changes the approved M1 engine: it adds a round counter and bodies that occupy tiles. It is done before M2 depends on the engine.

### 3. Debts addressed now

| ID | Action in this plan | Status after the plan |
|---|---|---|
| DT-07 | `publicState` returns a deep copy, so a server that changes the view cannot change the authoritative state | Closed, with a test |
| DT-08 | `npm audit fix` without `--force`; re-run `npm audit` and record what remains | Partially closed; the Colyseus major migration stays open for M2 |
| DT-11 | Reaction windows are decided in ADR 0007 | Design closed; implementation becomes DT-17 for M3 |
| DT-16 | "Initiated" kept; pitch already uses it | Closed |
| DT-05 | Corpses occupy their tile for the Nerve-based duration (implemented in M1). The resurrection rule (empty, unoccupied tile in range) is recorded in ADR 0003 | Partly closed: occupancy done; resurrection itself stays open until M3 |

Debts not addressed, with reason:
- **DT-04** (hidden item identity): post-MVP trigger not reached.
- **DT-08 major migration:** belongs to M2, when the match server is built on Colyseus 0.18.
- **DT-12** (frontend bundle): no client code exists yet; trigger is the M2 client.
- **DT-13** (WebSocket tests through the tunnel): needs the M2 infrastructure.
- **DT-15** (balance fixtures): trigger is M3.

A new debt is added: **DT-17** — implement reaction windows, slots and counter-attacks in the engine (M3).

### 4. Files

| File | Operation | What changes |
|---|---|---|
| `docs/adr/0007-reaction-abilities.md` | create | Status `Accepted`. Defines reaction, the slot bands, the refresh rule, the cost of 1 slot, and the reaction window. Examples: counterspell, counter-attack |
| `docs/adr/0003-permanent-death.md` | modify | Addendum: two-step resurrection rule (choose the character, then choose an empty and unoccupied tile in the caster's range) |
| `docs/adr/README.md` | modify | Adds ADR 0007 to the index |
| `pitch.md` | modify | Post-MVP section: new subsections "Reactions" and "Resurrection", each linking its ADR. The rest of the pitch is unchanged |
| `backend/engine/src/match.ts` | modify | `publicState` returns a deep copy |
| `backend/engine/src/match.test.ts` | modify | Test: changing the returned view does not change the state |
| `package-lock.json` | modify | Result of `npm audit fix` without `--force` |
| `.ia_context/inputs/technical-debt.md` | modify | Statuses updated as in section 3; DT-17 added |
| `backend/engine/src/corpse.ts` | create | `corpseRounds(nerve)`: 3 for Nerve 0–49, 4 for 50–99, 5 for 100. Integer comparisons only |
| `backend/engine/src/types.ts` | modify | `MatchState.round`; `UnitState.corpseExpiresAtRound` (null while alive). New event `corpse-removed` with `unit` |
| `backend/engine/src/initiative.ts` | modify | Round counter: a wrap of the queue to the first unit starts a new round |
| `backend/engine/src/actions.ts` | modify | A body occupies its tile, so `move` into it is `cell-occupied`; a body cannot be targeted (`target-invalid`). `endTurn` emits `corpse-removed` for each body whose time ends in the new round |
| `backend/engine/src/events.ts` | modify | Applies a death: sets the expiry round. Applies `corpse-removed`: marks the unit as permanently dead and frees the tile |
| `backend/engine/src/match.ts` | modify | `newMatch` starts `round` at 1. `publicState` deep copy (DT-07) |
| `backend/engine/src/*.test.ts` | modify | Tests in section 6 |

### 5. Contracts

**Public view (DT-07).** `publicState(state)` returns a fully independent copy: no object or array in the result is shared with `state`. The copy has no `rng` field, as before.

**Reactions (documented, not implemented).**
- A reaction is triggered by an event (for example, `spell-cast` or `attacked`) and is resolved in a reaction window before the triggering event is applied.
- The window is a pending state. Its response is one of `accept` or `decline`, and it is recorded as an event.
- Each reaction spends 1 slot. Slots are refreshed at the start of the unit's turn. Slot count = band of the unit's Nerve.

**Resurrection (documented, not implemented).**
- Step 1: the caster picks a defeated character from its team.
- Step 2: the caster picks a tile. The tile must be inside the ability's range (data), contain no living unit, and be on the board.
- The tile must hold no living unit and no body. A body occupies its tile until the corpse rule removes it (section 5, Corpses).
- Corpses (documented, not implemented): a defeated unit becomes a body on its tile. The body lasts a number of rounds that depends on the unit's Nerve (table to confirm, section 9). While it lasts, the tile is occupied and the unit cannot be targeted. When it ends, the body is removed and the unit is permanently dead; the item that appears in its place belongs to the post-MVP equipment drop. A match that ends first, or a revival, removes the body early.
- Revival removes the body first, then places the unit on the chosen tile. The body's tile is therefore free for the revived unit only if it is the chosen tile; otherwise it becomes free when the body is removed.

### 6. Tests planned

**Engine (this plan):**
- [x] Mutating the object returned by `publicState` (its units, board or initiative) leaves the state unchanged.
- [x] `publicState` still has no `rng` field, and its values equal the state's values.
- [x] The full suite stays green: `npm test -w @eldritch-alley/engine`, `npm run typecheck`, `npm run build`.

**Dependencies:**
- [x] `npm audit` before and after; the after-result is written into `technical-debt.md` (DT-08).
- [x] `npm test` and build pass after the lockfile change.

**Corpses (M1 engine):**
- [x] `corpseRounds`: Nerve 0 and 49 give 3; 50 and 99 give 4; 100 gives 5. Values outside 0..100 throw `RangeError`.
- [x] A defeated unit's tile cannot be entered: `move` into a body is `cell-occupied`.
- [x] A body cannot be targeted: `attack` on it is `target-invalid`.
- [x] Round counter: starts at 1, increases by 1 each time the turn wraps to the first unit.
- [x] A body whose expiry round is reached is removed at the `endTurn` that starts that round: `corpse-removed` is emitted, the unit is permanently dead, and its tile is free.
- [x] A match that ends before the expiry round leaves no `corpse-removed` event: no permanent death is recorded.
- [x] Replaying the events of a match with bodies rebuilds the same state as the live match (full `toEqual`).

**Documentation:**
- [x] ADR 0007 is linked from the ADR index and from the pitch.
- [x] Each pitch link resolves to the right ADR.

No new game rule is tested here, because none is implemented.

### 7. Dependencies

- M1 engine committed and green (88 tests).
- Owner decisions in section 2 recorded.
- No network access beyond the npm registry for `npm audit fix`.

### 8. Out of scope

- Reaction implementation, slot counting, counter-attacks and counterspell: M3 (DT-17).
- Resurrection implementation: M3 (DT-05).
- Per-skill slot costs: after the first reaction skills exist.
- Colyseus 0.18 migration: M2.
- Frontend bundle, WebSocket tests, balance values: see section 3.

### 9. Points to confirm before applying

1. **Slot bands.** The values in section 2 are starting points. Confirm them, or give different bands.
2. **Resolved by the owner:** the body occupies its tile until the corpse rule ends (see section 2, Corpse).
3. **Confirmed by the owner (2026-10-03):** the reaction window uses the PvP turn timer of 30 s (ADR 0004, now Accepted).
4. **Resolved by the owner:** corpse durations 3 / 4 / 5 by Nerve (section 2).
5. **Resolved by the owner:** the corpse rule is implemented now, in M1 (section 2).
6. **Confirmed by the owner (2026-10-03):** a round is one full pass of the initiative queue, counted when the turn wraps.
