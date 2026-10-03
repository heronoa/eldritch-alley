# Technical debt

Living list of known debts. Each item has a trigger: the condition that moves it out of the list and into work. Items are never removed; closed items stay here with their resolution, so the history of decisions is visible.

Status values: **Open**, **Closed**.

---

## Open

### DT-04 · Per-client state filtering for hidden items
- **Category:** Security
- **Risk if untreated:** the identity of an unknown item dropped on the map would reach clients before pickup, breaking the post-MVP rule.
- **Effort:** M
- **Trigger:** implementing equipment drops (post-MVP).
- **Evidence:** `backend/engine/src/match.ts`, `publicState`. It filters only the rng; there is no per-viewer filter.



### DT-12 · Frontend bundle size warning
- **Category:** Performance
- **Risk if untreated:** the Phaser bundle exceeds Vite's chunk-size limit, so the first load is heavier than it needs to be.
- **Effort:** P
- **Trigger:** building the M2 client.
- **Evidence:** `npm run build` output: "Some chunks are larger than 500 kB".

### DT-13 · WebSocket reconnection and the 3 s ping are not yet verified through the tunnel
- **Category:** Testing
- **Risk if untreated:** the M2 acceptance criteria are unverified: the default 3 s ping through the tunnel, and reconnection after a forced drop.
- **Effort:** P
- **Trigger:** closing M2.
- **Evidence:** `ROADMAP.md`, M2, "Pending, part of the M2 acceptance test".


### DT-15 · Balance values are fixtures only
- **Category:** Design
- **Risk if untreated:** movement budgets, attack and hit values exist only in tests. Real values come with M3 balancing.
- **Effort:** M
- **Trigger:** M3 balancing.
- **Evidence:** `backend/engine/src/*.test.ts` fixtures.


### DT-05 · Resurrection needs its implementation
- **Category:** Rules
- **Risk if untreated:** resurrection (two steps, ADR 0003 addendum) is not implemented. Bodies occupy their tiles (implemented in M1, round counter included), so the engine is ready for it.
- **Effort:** M
- **Trigger:** implementing resurrection (M3).
- **Evidence:** `docs/adr/0003-permanent-death.md` addendum; `backend/engine/src/corpses.test.ts`.

### DT-08 · Known vulnerabilities in dependencies (one high left, on the server path)
- **Category:** Security
- **Risk if untreated:** `npm audit` reports 15 advisories: 1 high, 12 moderate, 2 low. The high is `nanoid` (<=3.3.17), used by `@colyseus/core` on the server path, and it is fixed only by Colyseus 0.18. Most moderate and low advisories are fixed only by Colyseus 0.18 or by `overrides` in transitive packages pinned by Colyseus 0.16.
- **Done on 2026-10-03:** `ts-node-dev` (and with it the high advisories `chokidar` and `braces`, which had no fix) was replaced by `tsx` in the dev scripts of `game-server` and `platform-api`. Tests, typecheck and build pass. The `nanoid` high remains.
- **Effort:** M (Colyseus 0.18 migration, with its own ADR).
- **Trigger:** start of M2. **Gate:** the public deploy of M2 does not ship until the Colyseus 0.18 migration is done and `npm audit` shows no high advisory on the server path (roadmap, M2).
- **Evidence:** `npm audit` run on 2026-10-03 after the `tsx` swap (1 high, 15 total); `backend/*/package.json` dev scripts.

### DT-17 · Reaction windows, slots and counter-attacks in the engine
- **Category:** Rules
- **Risk if untreated:** reactions (counterspell, counter-attack) are decided (ADR 0007) but cannot be played yet. The engine has no reaction window, no reaction slots and no pending-response state.
- **Effort:** M
- **Trigger:** M3, before reaction skills are added.
- **Evidence:** `docs/adr/0007-reaction-abilities.md`; the M1 engine has no reaction code.

### DT-18 · Movement after reloading: rule to confirm
- **Category:** Rules / plan alignment
- **Risk if untreated:** the owner's answer said a unit may move "before or after" reloading. The code follows the move-then-act rule (DT-09): movement is allowed before reloading, not after.
- **Effort:** P
- **Trigger:** owner decision, before M2-a combat is tested by players.
- **Evidence:** `docs/adr/0002-one-resource-per-class.md` addendum; `backend/engine/src/actions.ts` (`validateMove`); `backend/engine/src/ammo.test.ts`.

---

## Closed

| ID | Item | Resolution |
|---|---|---|
| DT-07 | `publicState` returned shared references | Deep copy (`cloneData` in `match.ts`). Tested by `match.test.ts`. |
| DT-11 | Reaction windows were not designed | Decided in ADR 0007 (Accepted). Implementation tracked as DT-17. |
| DT-16 | "Initiated" vs "Initiate" | Kept "Initiated"; the pitch and the tables use it. |
| DT-17 | Implement reactions in the engine | Added as an open item for M3 (see below). |
| DT-09 | Movement allowed after the action was spent | `validateMove` rejects with `already-acted` once the action is spent. Covered by `actions.test.ts`. |
| DT-10 | `unit-defeated` used `unit` while other events use `actor` or `target` | The field is now `target`, matching `attacked`. Covered by `actions.test.ts` and `events.test.ts`. |
| DT-14 | M1 plan checklists unmarked; red phase not recorded | All 36 items marked, each mapped to a test. A retroactive red check is recorded in plan section 9. The original red-first order cannot be shown. |
| DT-01 | Modulo bias in `nextInt` | Rejection sampling, `backend/engine/src/rng.ts`. Tested by `rng.test.ts`. |
| DT-02 | `nextInt` with an empty range returned `NaN` | Throws `RangeError`. Tested by `rng.test.ts`. |
| DT-03 | Setup with an empty team was accepted | `newMatch` throws `RangeError`. Tested by `match.test.ts`. |
| DT-06 | Wide public surface in `index.ts` | Exports only the contract. |
| BUG-01 | Replay did not advance the rng, so rebuilt matches rolled differently | `attacked` carries `rngState`; `applyEvent` applies it. Tested by `properties.test.ts` (replay on full state, and a rebuilt match rolling the same numbers). Found in review, not in the original audit. |
| EXTRA | Duplicate unit ids were accepted | `newMatch` throws `RangeError`. Tested by `match.test.ts`. |
