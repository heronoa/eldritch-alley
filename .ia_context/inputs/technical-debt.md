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

### DT-05 · Defeated units occupy their cell
- **Category:** Rules
- **Risk if untreated:** a resurrected unit (ADR 0003, Priest ability) could be placed on a cell another unit now occupies.
- **Effort:** P
- **Trigger:** implementing resurrection (M3).
- **Evidence:** `backend/engine/src/actions.ts`, `occupantAt` (ignores defeated units, so a cell of a defeated unit is free to enter).

### DT-07 · `publicState` returns shared references
- **Category:** Security / architecture
- **Risk if untreated:** a server that mutates the view it sends to a client also mutates the authoritative state.
- **Effort:** P
- **Trigger:** integrating the engine into the match server (M2).
- **Evidence:** `backend/engine/src/match.ts`, `publicState` (a shallow rest spread).

### DT-08 · Known vulnerabilities in dependencies
- **Category:** Security
- **Risk if untreated:** `npm audit` reports 18 advisories: 4 high, 12 moderate, 2 low. High: `ts-node-dev`, `chokidar` and `braces` (dev tooling, no fix available) and `nanoid` (fixed only by Colyseus 0.18). Colyseus 0.16 advisories (`colyseus`, `@colyseus/ws-transport`, `@colyseus/core`, `@colyseus/redis-driver`) only have fixes in a major version (0.18). Some moderate advisories have fixes without a major bump (`@colyseus/auth`, `@colyseus/redis-presence`, `@colyseus/uwebsockets-transport`, `grant`, `request-oauth`, `uuid`, `elliptic`, `jwk-to-pem`).
- **Effort:** M for the Colyseus migration; P for the non-major fixes.
- **Trigger:** start of M2 (the match server depends on Colyseus). Non-major fixes can go at any time, through `npm audit fix` without `--force`, after review.
- **Evidence:** `npm audit` output, run on 2026-10-03.



### DT-11 · Reaction windows are not designed
- **Category:** Architecture
- **Risk if untreated:** reaction abilities (counter, overwatch) need actions taken during another unit's turn. The turn model in M1 does not allow that, and M1 does not implement it.
- **Effort:** M
- **Trigger:** before M3 starts abilities. Candidate for an ADR.
- **Evidence:** `.ia_context/plans/engine-m1.plan.md`, decisions table ("Events per action").

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

### DT-16 · Post-MVP naming: "Initiated" vs "Initiate"
- **Category:** Documentation
- **Risk if untreated:** the base class is named "Initiated" in the pitch, and "Initiate" in the post-MVP spec as first written. Code and docs must use one name.
- **Effort:** P
- **Trigger:** confirm with the owner, then apply everywhere.
- **Evidence:** `pitch.md`, Post-MVP section.

---

## Closed

| ID | Item | Resolution |
|---|---|---|
| DT-09 | Movement allowed after the action was spent | `validateMove` rejects with `already-acted` once the action is spent. Covered by `actions.test.ts`. |
| DT-10 | `unit-defeated` used `unit` while other events use `actor` or `target` | The field is now `target`, matching `attacked`. Covered by `actions.test.ts` and `events.test.ts`. |
| DT-14 | M1 plan checklists unmarked; red phase not recorded | All 36 items marked, each mapped to a test. A retroactive red check is recorded in plan section 9. The original red-first order cannot be shown. |
| DT-01 | Modulo bias in `nextInt` | Rejection sampling, `backend/engine/src/rng.ts`. Tested by `rng.test.ts`. |
| DT-02 | `nextInt` with an empty range returned `NaN` | Throws `RangeError`. Tested by `rng.test.ts`. |
| DT-03 | Setup with an empty team was accepted | `newMatch` throws `RangeError`. Tested by `match.test.ts`. |
| DT-06 | Wide public surface in `index.ts` | Exports only the contract. |
| BUG-01 | Replay did not advance the rng, so rebuilt matches rolled differently | `attacked` carries `rngState`; `applyEvent` applies it. Tested by `properties.test.ts` (replay on full state, and a rebuilt match rolling the same numbers). Found in review, not in the original audit. |
| EXTRA | Duplicate unit ids were accepted | `newMatch` throws `RangeError`. Tested by `match.test.ts`. |
