# Plan — M2-a frontend logic: grid, protocol, net client, selection, log

**Milestone:** m2a-logic
**Feature pai:** [m2a.index.md](m2a.index.md)
**Created on:** 2026-10-03
**Status:** pendente

---

### 1. Objective

Write every piece of frontend behaviour that does not need a browser: coordinate maths, colour by height, the client side of the protocol, the click-to-intent logic, and the event log text. All of it is tested with vitest in Node. Exposes the functions listed in section 3 to the integration plan.

### 2. Prerequisites

- `m2a-server` approved, so `backend/game-server/src/protocol.ts` exists. This plan imports its types through a copy (section 4.1) so it can be developed in parallel.
- Read `frontend/package.json` and `frontend/src/main.ts`. Do not change the Phaser setup in this plan.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/package.json` | modify | Add dev dependency `vitest` (same major as `backend/engine`). Add script `"test": "vitest run"` |
| `frontend/vitest.config.ts` | create | Environment `node`. Includes `src/**/*.test.ts` |
| `frontend/src/protocol.ts` | create | Copy of the server protocol types (section 4.1) |
| `frontend/src/view/grid.ts` | create | Coordinate and colour functions (section 4.2) |
| `frontend/src/game/selection.ts` | create | Click-to-intent logic (section 4.3) |
| `frontend/src/game/log.ts` | create | Event text (section 4.4) |
| `frontend/src/net/session.ts` | create | Client wrapper (section 4.5) |
| `frontend/src/**/*.test.ts` | create | Tests in section 5 |

Do not edit `frontend/src/main.ts` or any scene file in this plan.

### 4. Contracts

**4.1 Protocol copy.** `frontend/src/protocol.ts` exports the same names as the server's `protocol.ts`: `PROTOCOL_VERSION`, the message name constants, and the payload types `ClientAction`, `StateMessage`, `RejectedMessage`, `EndedMessage`. `ClientAction` is `Action` without `actor`. The engine types are copied as plain types, not imported, so the frontend has no dependency on the engine package. Add a comment at the top: "Keep in sync with backend/game-server/src/protocol.ts".

**4.2 `view/grid.ts`**
- `TILE_SIZE = 48` and `ORIGIN = { x: 40, y: 40 }` as constants.
- `cellToPixel(cell: { x: number; y: number }): { x: number; y: number }` returns the top-left pixel of the cell: `x = ORIGIN.x + cell.x * TILE_SIZE`, `y = ORIGIN.y + cell.y * TILE_SIZE`.
- `pixelToCell(px: { x: number; y: number }): { x: number; y: number } | null` returns the cell under a pixel, or `null` outside the 8×8 board. Integer division is not allowed by the team's rule for engine code; for the frontend use `Math.floor`.
- `heightColor(level: number): number` returns a colour for levels 0, 1, 2 (distinct) and throws a `RangeError` for any other integer. Values: `0x2b2d3a`, `0x4a4e69`, `0x7b6d8d`.

**4.3 `game/selection.ts`**
- `type Intent = { kind: 'none' } | { kind: 'select'; unitId: string } | { kind: 'send'; action: ClientAction } | { kind: 'move-preview'; to: Cell }`.
- `resolveClick(input: { state: PublicState; selectedId: string | null; cell: Cell; humanTeam: 'A' | 'B' }): Intent`:
  - If the clicked cell holds a living unit of the human team: `select` that unit.
  - If `selectedId` is set and the clicked cell holds a living enemy at Chebyshev distance `<=` the selected unit's range (or `1` if magazine empty and not null): `send` `{ type: 'attack', target }`.
  - If `selectedId` is set and the clicked cell is empty and adjacent to the selected unit: `send` `{ type: 'move', to: cell }`.
  - Otherwise: `none`.
  - Never returns `send` for a unit that is not the current unit in `state.initiative[state.currentIndex]`. In that case return `none`.
- The function is pure. It does not read `rng`.

**4.4 `game/log.ts`**
- `describeEvent(event: Event, names: Record<string, string>): string` returns a Portuguese sentence for each event type. `names` maps unit ids to display names. Event types: `moved`, `attacked`, `unit-defeated`, `corpse-removed`, `reloaded`, `turn-ended`. Unknown types return `"evento desconhecido"`.
- Keep the sentences short: "Sniper moveu de (0,0) para (1,0)", "Sniper acertou Priest por 4", "Priest errou", "Priest caiu", "Sniper recarregou", "Vez de Wizard".

**4.5 `net/session.ts`**
- `class Session` with:
  - `constructor(endpoint: string)`.
  - `connect(): Promise<void>` joins the room `battle` through `@colyseus/sdk`; stores the `reconnectionToken` in `sessionStorage` under the key `ea.reconnect` inside try/catch.
  - `send(action: ClientAction): void`.
  - `onState(cb)`, `onEvents(cb)`, `onRejected(cb)`, `onEnded(cb)`, each returning an unsubscribe function.
  - `reconnect(): Promise<boolean>`: if a token exists, calls `client.reconnect(token)`; returns `true` on success.
- All `sessionStorage` access is inside try/catch. The session works without storage.
- The SDK import path and version are confirmed in step 1 of the server plan. Use the names the SDK exports; do not guess.

### 5. Tests planned (vitest, node)

- [ ] `cellToPixel` and `pixelToCell` are inverses for all 64 cells.
- [ ] `pixelToCell` returns `null` for pixels just outside the board on each side.
- [ ] `heightColor` returns distinct values for 0, 1 and 2, and throws `RangeError` for `3` and `-1`.
- [ ] `resolveClick` selects a human unit; a click on an enemy with no selection returns `none`.
- [ ] `resolveClick` returns `send attack` for an enemy in range, and `none` for one out of range.
- [ ] With an empty magazine, `resolveClick` treats the attack as melee (range 1) and returns `none` for a distance 2 enemy.
- [ ] `resolveClick` returns `send move` for an adjacent empty cell, and `none` for a non-adjacent empty cell.
- [ ] `resolveClick` returns `none` when the selected unit is not the current unit.
- [ ] `describeEvent` produces the sentence for each of the six types, and `evento desconhecido` for an unknown type.
- [ ] `Session` is constructed and `send` is a no-op before `connect` without throwing (storage stubbed to throw).

### 6. Dependencies

- `m2a-server` plan approved (protocol file exists).
- No engine change.

### 7. Execution steps

1. Add vitest and the test script. Run `npm test -w @eldritch-alley/frontend` with one trivial test to confirm the runner works (red then green).
2. Write `protocol.ts`, then `grid.ts` with its tests first.
3. Write `selection.ts` with its tests first, one test at a time.
4. Write `log.ts` with its tests first.
5. Write `net/session.ts` and its one test. Do not connect to a real server in a unit test.
6. Run `npm test` and `npm run build -w @eldritch-alley/frontend`.

### 8. Acceptance

- [ ] All tests in section 5 pass.
- [ ] `npm run build -w @eldritch-alley/frontend` passes.
- [ ] No file under `frontend/src/scenes/` or `frontend/src/main.ts` changed.
- [ ] `frontend/src/protocol.ts` has the header comment saying to keep it in sync.

### 9. Out of scope

Scenes, rendering with Phaser, the lobby, CSS or colours beyond `heightColor`, reconnection UI, any server code.
