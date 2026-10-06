# Plan: EA-1 · Line of sight is wrong on two maps

**Milestone:** lot 1 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback (`.ia_context/inputs/players-feedback.md`)
**Created:** 2026-10-05
**Status:** ready for implementation (decisions closed 2026-10-05)

## 0. Findings

Read-only investigation, run against the engine on the match server's maps (seed 1 for `street`, seed 2 for `roof`).

- **The engine has no line of sight.** `validateAttack` in `backend/engine/src/actions.ts` checks only "not dead, not an ally, distance ≤ reach". The alley complaint ("shots pass through buildings") is the missing rule, not a wrong check.
- **The rooftop complaint is not explained by sight.** The gap is one column (x = 6) at level 0, with a walkable bridge at (6, 4). A sniper with ammunition on (5, 2) shoots a target on (7, 2), and the engine **accepts** it. The shot is refused in two other cases:
  - the magazine is empty: the sniper becomes melee, reach 1 (`reachOf` in `frontend/src/game/selection.ts` mirrors this);
  - the class has range 1: Wizard and Priest attack only in melee today (EA-14).
  
  **Status: not reproduced** (owner, 2026-10-05). The playtest case was observed once, and the class and magazine were not recorded. It is outside the scope of the EA-1 bug. The owner will re-test in the game three cases: Sniper with a full magazine, Sniper with an empty magazine, and Wizard. The owner reports to the team if the first case fails. The sniper regression test below stays in place.
- The client does not block the shot either: `resolveClick` uses Chebyshev distance and reach only.
- **Rule change pending in EA-14:** an empty magazine will refuse the basic attack (`no-ammunition`, "sem munição, recarregue") instead of falling back to melee. Once that lands, the sniper's gap test with an empty magazine expects `no-ammunition`, not `target-out-of-range`.

## 1. Objective

Add a line-of-sight rule decided by height, in the engine. The server validation and the client preview both call it. An attack without line of sight is refused with its own reason. The rule is independent of the walkability flag.

## 2. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/sight.ts` | create | `hasLineOfSight(board, from, to): boolean`, integer math only (ADR 0005) |
| `src/sight.test.ts` | create | Unit tests, section 4 |
| `src/actions.ts` | modify | `validateAttack` calls `hasLineOfSight` after the reach check and returns `no-line-of-sight` |
| `src/types.ts` | modify | Add `'no-line-of-sight'` to `RejectReason` |
| `src/index.ts` | modify | Export `hasLineOfSight` for the client (decision D1) |
| `src/no-node-deps.test.ts` | create | Fails if any file under `backend/engine/src` imports `node:*` or a package outside the engine (decision D1 condition) |

**Rule.** The eye height of a unit is its cell level plus 1. For an attack from A to T at distance n (Chebyshev, n ≥ 2), each intermediate cell i = 1 … n − 1 on the Bresenham line blocks if its level is above the sight line at that step. Scaled by n so every value is an integer:

```
block if  level(cell_i) * n  >  eyeA * n + (eyeT − eyeA) * i
where eyeA = level(A) + 1, eyeT = level(T) + 1
```

- **Symmetric (decision D2):** the attack is blocked if the line from A to T or the line from T to A is blocked.
- Adjacent targets (n = 1) have no intermediate cell: always visible.
- A cell at the eye level does not block (it is on the line, not above it).
- The rooftop's void cells, mapped to level 0 by `boardOf`, never block.
- Props (cars, crates, trees) are not in this plan (decision D3, separate ticket).

### Server (`backend/game-server`)

No code change. The server already calls `applyAction`. The new reason reaches the client through the existing rejection message.

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/protocol.ts` | modify | Add `'no-line-of-sight'` to the `RejectReason` copy |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Message for the reason ("Sem linha de visão" / "No line of sight") |
| `src/game/log.ts` | modify | Map the new reason in the rejection log |
| `src/game/selection.ts` | modify | `resolveClick` refuses an attack target without line of sight, so the attack highlight does not paint it |
| `src/game/highlight.test.ts`, `selection.test.ts` | modify | Preview cases, section 4 |

**Decision D1 (closed):** the frontend imports the pure engine function `hasLineOfSight` from `backend/engine`. The engine stays free of Node and framework dependencies, and `no-node-deps.test.ts` guards that. The client must not carry a copy of the rule. The build has to show the bundle still works; check the Vite build output after the import.

## 3. Contract of the layer

- **`hasLineOfSight(board, from, to): boolean`**: pure, no state, no I/O. Symmetric (D2). Throws `RangeError` for positions outside the board, like `levelAt`.
- **Rejection order** in `validateAttack`: `already-acted`, `target-invalid`, `target-out-of-range`, `no-line-of-sight`. The ammunition rule comes first, as it does today.
- **Not done by this layer:** props, cover, height bonus on hit chance (M3 rules), attacks on empty cells.

## 4. Tests planned

Engine unit tests (`sight.test.ts`):
- [ ] Adjacent target: visible on any levels.
- [ ] Alley case: shooter and target on level 0, a level-5 building between: blocked (must fail).
- [ ] Rooftop case: shooter and target on level 6, the level-0 gap between: visible (must pass).
- [ ] Target behind a building corner (diagonal line through a corner cell above the line): blocked.
- [ ] Target behind a car at the eye level: visible (not above the line).
- [ ] Shot from a rooftop over a low wall: visible.
- [ ] Alley T-junction: a cell that is not on the line does not block.
- [ ] Symmetry on every pair of cells of the three maps (D2).

Engine action tests (`actions.test.ts`):
- [ ] Attack through a building: rejected `no-line-of-sight`, state unchanged.
- [ ] **Regression, the playtest case:** the sniper with ammunition shoots across the rooftop gap: accepted.
- [ ] Sniper with an empty magazine across the gap: `target-out-of-range` today (melee reach 1). **After EA-14:** `no-ammunition`. The test is updated when EA-14 lands.

Client tests:
- [ ] The attack preview does not paint a target behind a building.
- [ ] The attack preview paints the target across the rooftop gap (sniper with ammunition).
- [ ] The log message for `no-line-of-sight` is translated in both catalogs (existing `catalog.test.ts`).
- [ ] `no-node-deps.test.ts` passes, and the Vite build succeeds with the import.

**Pending for the Wizard and Priest** (rooftop case at range 2): depends on EA-14. Write it as `it.todo` now, and enable it when EA-14 lands.

## 5. Dependencies

- Engine: none.
- Client: needs the engine import (D1).
- EA-14 for the Wizard and Priest rooftop case, and the `no-ammunition` update of the sniper test.
- EA-2 touches `selection.ts` too. Merge EA-1 first, or rebase EA-2 on it.

## 6. Decisions (closed 2026-10-05)

- **D1. Shared rule with the client:** imports the pure engine function; engine has no Node or framework dependencies, enforced by a test.
- **D2. Symmetry:** blocked if either direction is blocked.
- **D3. Props:** out of this ticket. A separate ticket for obstacles will be created in Jira by the owner.

## 7. Out of scope

- Props and cover (separate ticket).
- Height bonus on accuracy and range (M3).
- The Sniper's numbers (EA-11, after this).
- Movement and walkability (EA-2).
- Rooftop case: not reproduced; the owner re-tests it in the game (Sniper with full magazine, Sniper with empty magazine, Wizard). Not an EA-1 bug.
