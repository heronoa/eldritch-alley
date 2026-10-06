# Plan: EA-2 and EA-7 · Reachable movement, multi-cell path with preview

**Milestone:** lot 1 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Closes:** DT-54 (movement is one tile per action; no pathfinding), DT-70 (client imports engine source files), DT-72 (first-tap preview shows no path or cost)
**Requires:** ADR 0010 accepted before code (written 2026-10-05)
**Created:** 2026-10-05
**Status:** ready for implementation (decisions closed 2026-10-05)

## 0. Findings

- **EA-2 is a display bug.** The server refuses what the preview wrongly shows. Measured on the street map:
  - a step of +1 level costs 2 movement points (`moveCost`); the preview highlights the cell while any movement is left, and the engine answers "Movimento insuficiente" with 1 point left;
  - a step of +2 or more is refused by the height rule ("Desnível alto demais"), and the preview highlights it too.
- **Buildings are walkable terrain, by design.** A step of up to 1 level, paid at 2 points, is legitimate. Future abilities (teleport, grapple, climb) open the roofs. The preview must show exactly what the engine accepts.
- The client highlights neighbours with Chebyshev distance 1 (`resolveClick` in `frontend/src/game/selection.ts`), checking neither cost nor height.

## 1. Objective

The engine computes the cells a unit can reach this turn and the path to each. A move carries only the destination; the engine finds the path and returns it in the event. The client shows the reachable cells from the same function and sends only the destination. The protocol change is in ADR 0010.

## 2. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/movement.ts` | create | `movementProfile(unit)`, `reachableCells(state, unitId)`, `findPath(state, unitId, to)`; `moveCost` moves here |
| `src/movement.test.ts` | create | Section 4 |
| `src/types.ts` | modify | `MovementProfile { maxStepUp, maxStepDown, climbCost }` on the unit; `moved` event gains `path: Position[]`; new reason `'no-path'` |
| `src/actions.ts` | modify | `validateMove` uses `findPath`; `not-adjacent` is replaced by `no-path` |
| `src/events.ts` | modify | `moved` applies the path: `movementLeft` decreases by the path cost, the unit ends on the last cell |
| `src/match.ts` | modify | `newMatch` sets each unit's profile from its class data (defaults: `maxStepUp 1`, `maxStepDown 1`, `climbCost 1`) |
| `src/index.ts` | modify | Export `reachableCells` and `findPath` for the client (EA-1 D1) |
| `src/no-node-deps.test.ts` | create or reuse from EA-1 | Same guard as EA-1 |

**Profile.** Today's rule becomes data. A step is allowed when the level difference is between `−maxStepDown` and `maxStepUp`. A step costs `1 + climbCost × climb`. The defaults equal the current rule, so existing matches replay the same way.

**Path.** Dijkstra over integer costs, bounded by `movementLeft`. Costs are 1 or 2 per step, so a bucket queue is enough. Ties are broken by the fixed neighbour order (x, then y), so the same state always gives the same path (ADR 0005).

**Blocking (decision D2, closed):**
- Allies are passable: a path may go through an ally's cell, and the cost of that cell counts.
- Enemies block the path.
- The destination must be free of any unit. An occupied destination is refused with `cell-occupied`, whether the occupant is an ally or an enemy.
- Board obstacles do not exist yet (separate ticket), so no other blocking applies.

### Server (`backend/game-server`)

| File | Operation | What changes |
|---|---|---|
| `src/battle-room.ts` | check | The move handler passes the destination through; the engine returns the path in the event. No change expected |
| Protocol version | modify | Bump, as ADR 0010 requires. Find the version constant in the protocol module and bump it |

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/protocol.ts` | modify | `moved` carries `path`; `'no-path'` added to `RejectReason` |
| `src/game/selection.ts` | modify | Move highlight comes from `reachableCells`, not adjacency. First tap on a reachable cell shows the path and its cost (EA-7); second tap on the same cell sends the move |
| `src/game/highlight.ts` | modify | Move mode paints `reachableCells` only |
| `src/game/actions.ts` | modify | `canMove` uses the reachable set, not `movementLeft > 0` alone |
| `src/game/log.ts`, i18n catalogs | modify | `'no-path'` message |
| Map view (file to confirm) | modify | Animates the unit along `path`, cell by cell |
| Tests: `highlight.test.ts`, `selection.test.ts`, `actions.test.ts` | modify | Section 4 |

**Client imports the engine functions** (EA-1 D1): `reachableCells` and `findPath` come from `backend/engine`, not from a copy. The import goes through the package entry `backend/engine/src/index.ts` and not the source files (DT-70). Today `selection.ts:4-5` imports `engine/src/movement` and `engine/src/sight` directly; both move to the entry, which already exports `findPath`, `reachableCells` and `hasLineOfSight`. DT-70 is closed when this PR merges.

**First-tap preview draws the path and the cost** (DT-72). Today `selection.ts` returns the `path` and `cost` in the `move-preview` intent, and `MatchScene.ts:231-232` discards both, keeping only `to`. The scene draws the path cell by cell and the cost next to the destination. DT-72 is closed when this PR merges.

**Two-step tap** (from the camera handoff): first tap selects the destination and draws the path with its cost; second tap on the same cell confirms. One tap never moves a unit. On desktop, hover shows the preview and click confirms.

## 3. Contract of the layer

- **`reachableCells(state, unitId): Position[]`**: every cell the unit can end on this turn. Empty if the unit does not have the turn. Pure.
- **`findPath(state, unitId, to): { path: Position[], cost: number } | null`**: cheapest in cost, deterministic. `null` if unreachable.
- **Action `move { to }`** (shape unchanged on the wire):
  - accepted: event `moved { actor, from, to, path }`, `path` from the first step to `to`;
  - rejected: `out-of-bounds`, `cell-occupied`, `already-acted`, `no-path`, `not-your-turn`.
- **Height step refusal (decision D3, closed):** a step that the profile forbids keeps `height-step-too-high` when it is the only obstacle to the destination's adjacent cell; otherwise the destination is `no-path`. The preview never paints either.
- **Not done by this layer:** attacks, reload, turn end, camera.

## 4. Tests planned

Engine (`movement.test.ts`):
- [ ] Reachable set excludes buildings above `maxStepUp`.
- [ ] Reachable set excludes enemy cells; allies are passable but not in the reachable set as destinations.
- [ ] A path through an ally's cell is accepted, and its cost counts.
- [ ] Climb of 1 level costs 2: with 1 point left it is not reachable; with 2 it is. **This is the case measured in the playtest.**
- [ ] Path cost never exceeds `movementLeft`; the path is the cheapest one.
- [ ] Ties: the same state always gives the same path.
- [ ] A profile with `maxStepUp 2` makes a 2-level climb reachable, and its cost follows the profile.
- [ ] `applyEvents` rebuilds the same state from `moved` events with a path.

Engine actions (`actions.test.ts`):
- [ ] Move to a building 2 levels up: rejected `height-step-too-high` or `no-path`, per D3.
- [ ] Move with 1 point left to a 1-level climb: rejected `no-path`. The old `not-enough-movement` is replaced.
- [ ] Move to an adjacent free cell with enough points: accepted, path of 1 step.
- [ ] Move to an occupied destination: `cell-occupied`.

Parity (engine vs client, the ticket's acceptance test):
- [ ] For each unit on the street map, the client's highlighted move cells equal `reachableCells`. The three maps if the cost allows.

Client:
- [ ] Highlight paints only reachable cells.
- [ ] First tap on a reachable cell shows the path and cost, and sends nothing.
- [ ] Second tap sends `move` with the destination only.
- [ ] A destination without a path is neither painted nor sent.
- [ ] The animation steps follow the returned path (unit test on the step list).

## 5. Dependencies

- EA-1 (shared import and no-node-deps guard). Merge EA-1 first.
- EA-5 and EA-6 use the same `reachableCells` pattern.
- EA-4 needs `reachableCells` to decide "nothing left to move". EA-4 follows this plan.
- ADR 0010 accepted before any code (done, 2026-10-05).

## 6. Decisions (closed 2026-10-05)

- **D1. Protocol:** destination-only move, path in the event, protocol bump (ADR 0010).
- **D2. Allies:** passable, not destinations; enemies block.
- **D3. Reason for a forbidden step:** keep `height-step-too-high` when the step is the cause; otherwise `no-path`.

## 7. Out of scope

- Abilities that change the profile (escalar) or add actions (teleporte, gancho). The profile is ready for them; no ability is implemented.
- Board obstacles (cars, crates, trees): separate ticket.
- Camera (EA-12), enemy ranges (EA-6), attack by clicking the sprite (EA-8).
- Balance of movement values (EA-11).
