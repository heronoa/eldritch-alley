# Pre-review — Minimal deterministic battle engine (M1)

**Branch:** `feat/engine`
**Generated on:** 2026-10-03

---

### 1. What to test

- **Full suite, clean install:** `npm ci` then `npm test -w @eldritch-alley/engine` must pass with 119 tests, and `npm run typecheck` and `npm run build` must pass. This is the first check, because the engine's guard test reads the source files.
- **Determinism, by hand:** in a scratch script, create a match with seed 1, play the same three actions twice, and compare the output. They must be identical, including every event and the final state.
- **Replay after an attack:** play an attack that rolls, then call `applyEvents` with the setup and the emitted events. The rebuilt state must equal the live state in full (`toEqual`), and the next roll must match. A hash comparison alone is not enough, because the hash excludes the random source by design.
- **Empty magazine:** with a Sniper at ammo 0, an attack at distance 2 must be rejected with `target-out-of-range`; at distance 1 it must deal half the attack, rounded down, and spend no round.
- **Body occupancy:** kill a unit, then move a neighbour onto its tile: the move must be rejected with `cell-occupied`. Advance the rounds until the expiry round: the same move must succeed after `corpse-removed`.
- **Match ends first:** kill the last unit of a team: no `corpse-removed` must appear and the unit must not be permanently dead.
- **Rejection leaves no trace:** a rejected action must not change the state object and must not produce events (covered by `actions.test.ts`, "rejections").
- **Public view:** mutating the object returned by `publicState` must not change the state.

---

### 2. Code checklist

- [ ] No `/` in engine source outside comments and strings (the guard test covers this, but read the new helpers too)
- [ ] No `Math.random`, `Date`, `process`, `require` or `node:` in `backend/engine/src`
- [ ] `publicState` and `hashState` both exclude the random source, and no test expects the opposite
- [ ] Every new `RejectReason` appears in the rejection order documented in `actions.ts` and in plan section 4
- [ ] Every event type handled in `applyEvent` is also produced by `buildEvents`, and the reverse
- [ ] `ts-node-dev` is gone from both backend `package.json` files, and `tsx` is the dev runner
- [ ] `.ia_context/` contains only English content

---

### 3. Behavior checklist

- [ ] A unit with a magazine starts full; a shot spends one round, including a missed shot
- [ ] Reload fills the magazine and ends the unit's action; a full magazine cannot be reloaded
- [ ] Move-then-act holds: a unit that has attacked cannot move, and a unit that has moved can still attack and reload
- [ ] Two units cannot end on the same tile, and a body blocks its tile until it is removed
- [ ] The round number rises only when the order wraps to the first unit
- [ ] ADR 0002, 0003, 0004 and 0007 are linked from the ADR index and their statuses match their text
