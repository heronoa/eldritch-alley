# MR — Minimal deterministic battle engine (M1)

**Branch:** `feat/engine`
**Base branch:** `develop`
**Milestone:** M1
**Ticket(s):** —
**Date:** 2026-10-03

---

### 1. What this MR delivers

It delivers the M1 engine in `backend/engine`: an 8×8 grid with height levels, movement with cost, initiative, a basic attack with range, a seeded random source, an event log, and a replay function that rebuilds the full state from the setup and the events. The public contract is `newMatch`, `applyAction`, `applyEvents`, `publicState` and `hashState`. Everything the match server (M2) will call goes through that surface.

It also carries three things the plan did not originally include, all approved after the plan was written: **bodies** (a defeated unit's body occupies its tile for 3, 4 or 5 rounds, by Nerve, before the death becomes permanent), **ammunition** (the Sniper's magazine, reload, and melee at half damage with an empty magazine), and the **move-then-act** rule enforced in code (DT-09). The rules behind them are recorded in ADR 0002 (addendum), ADR 0003 (addendum) and ADR 0007.

**Divergences from the approved plan, named explicitly:**
- **Plan corrections made during drafting:** a `move` is one step to an adjacent cell; each unit carries `range` and `movement` as data; `not-adjacent` was added to the rejection reasons; every action carries `actor`, so `not-your-turn` is enforceable.
- **Replay bug found in review and fixed before merge:** the random source was not advanced on replay, so a rebuilt match rolled differently. The `attacked` event now carries `rngState`, and `applyEvent` applies it. The hash excludes the random source by design, so this was only caught by comparing the full state.
- **Hit resolution uses rejection sampling**, not a plain modulo, to remove the bias of `2^32 % span`. The number of draws per roll is therefore variable; the event carries the state after the roll, which is what makes replay correct.
- **`unit-defeated` and `corpse-removed` use the field `target`**, matching `attacked`. The first draft used `unit` for `unit-defeated`.
- **`turn-ended` carries `round`**, so replay sets the round from the event.
- **The round counter is advanced in `endTurn` (`actions.ts`)**, not in `initiative.ts` as the plan's file table said. The behaviour is as specified: a round rises when the order wraps to the first unit.
- **The test checklist in the plan was marked after verification.** The plan asked for each test to be red before its implementation. That order was not recorded, so a retroactive check is recorded in plan section 9 instead: with the implementation removed, all test files fail with missing-module errors.

**Not in this MR:** reaction windows and reaction slots (M3, DT-17), resurrection (M3, DT-05), and the move-after-reload rule, which the code follows as move-then-act until the owner confirms it (DT-18).

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `backend/engine/src/types.ts` | Public types: units with data-only progression fields, state, actions, events, rejection reasons | The contract the server (M2) depends on |
| `backend/engine/src/rng.ts` | mulberry32 with rejection sampling; integer bounds only | The only source of randomness; no modulo bias |
| `backend/engine/src/board.ts` | Grid, bounds, height level, Chebyshev distance | Geometry used by every rule |
| `backend/engine/src/initiative.ts` | Queue by speed, ties by setup order; removal of defeated units | Turn order is public state and deterministic (ADR 0001) |
| `backend/engine/src/actions.ts` | Validation and events for move, attack, reload and end turn; `resolveHit`; round counter; body and corpse expiry | Every rejection reason is decided here, in a fixed order |
| `backend/engine/src/events.ts` | `applyEvent`: the only place state changes; used by live play and replay | Replay and live play cannot diverge by construction |
| `backend/engine/src/match.ts` | `newMatch` with setup validation; `applyAction`; `applyEvents`; `publicState` as a deep copy without the random source; `hashState` | The public entry point |
| `backend/engine/src/hash.ts` | FNV-1a 32-bit over a canonical serialization | Fingerprint for verification and tests |
| `backend/engine/src/corpse.ts` | Body duration by Nerve: 3 (0–49), 4 (50–99), 5 (100) | Owner's rule, integer comparisons only |
| `backend/engine/src/index.ts` | Exports only the contract | Keeps helpers private to the package |
| `backend/engine/src/*.test.ts` | 13 test files, 119 tests, including property tests over 200 seeds | Covers the rules, rejections, replay and the determinism guard |
| `backend/engine/src/forbidden.test.ts` | Fails if engine sources use `Math.random`, `Date`, `process`, `require`, `node:` or `/` | Enforces ADR 0005 mechanically |
| `docs/adr/0002`, `0003`, `0004`, `0007` and index | Ammunition addendum; body and resurrection addendum; timer confirmed at 30 s; reaction ADR | Decisions the code implements or depends on |
| `pitch.md` | Post-MVP sections: progression, equipment, reactions, bodies and resurrection | Direction only; nothing here enters M1 |
| `package.json` (game-server, platform-api), `package-lock.json` | `ts-node-dev` replaced by `tsx`; lockfile updated | Removes three high advisories from the dev tree (DT-08) |
| `.ia_context/` | Plans, technical debt list, description and pre-review, README | Versioned working artifacts |

### 4. Notes for the reviewer

- **Integer math everywhere.** The guard test rejects `/`, so the bodies, ammunition and melee damage use comparisons, subtraction and `>>` instead of division. Please read `corpse.ts` and the `meleeDamage` helper with that in mind.
- **Random source is excluded on purpose** from `publicState` and from `hashState`. A replay never rolls, so including it in the hash would make the replay of a live match impossible to match. Replay correctness is checked on the full state in `properties.test.ts` and `corpses.test.ts`, not on the hash alone.
- **Dead units stay in state.** A defeated unit keeps its record in `units`; the death becomes permanent only with `corpse-removed`. This is what lets the platform record a permanent death, and what keeps resurrection possible later (ADR 0003).
- **Setup errors throw, rule violations do not.** A malformed setup throws `RangeError`; an illegal action returns `{ ok: false, reason }` and leaves no trace.
- **Open decisions are marked as open in code and docs.** The move-after-reload rule (DT-18) is the one the owner has not decided.
- **npm audit:** 15 advisories remain, one high (`nanoid`) on the server path. It is fixed only by the Colyseus 0.18 migration, which is the first task of M2-a and a gate for the M2-b deploy (DT-08).
