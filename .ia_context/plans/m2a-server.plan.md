# Plan — M2-a server: Colyseus 0.18, match room, session, bot

**Milestone:** m2a-server (first step of M2-a)
**Feature pai:** [m2a.index.md](m2a.index.md)
**Created on:** 2026-10-03
**Status:** pendente

---

### 1. Objective

Run a complete match on the server: one human (team A) against the bot (team B), on the engine's public contract, with reconnection. Exposes the message protocol that the frontend uses (step 6). Changes no engine code.

### 2. Decisions this plan relies on (do not change)

| Topic | Decision |
|---|---|
| Colyseus | 0.18. Packages `colyseus`, `@colyseus/core`, `@colyseus/ws-transport` at `^0.18.1`; `@colyseus/schema` at `^5.0.8` (installed transitively, not used for state) |
| Roster | Team A: Sniper, Wizard, Priest. Team B (bot): the same three. No choice in M2-a |
| Map | One fixed 8×8 map with three height levels, defined as data in `backend/game-server/src/map.ts` |
| Session | The Colyseus `client.sessionId` is the session. No custom id. Team A is given to the first client; a second client is refused |
| State sync | The room keeps the engine `MatchState` in a private field. It is not Colyseus Schema. The server sends JSON messages: `state` with `publicState`, `events`, `rejected`, `ended` |
| Reconnection | `allowReconnection(client, 120)` in `onDrop`. On `onReconnect`, the server sends a `state` message. The client reconnects with its `reconnectionToken` |
| Forfeit | If the reconnection window expires, the human's team loses and the room broadcasts `ended` |
| Timer | None |
| Bot | Utility heuristic (section 4.5). Uses only `applyAction`, `publicState` and `newMatch` from `@eldritch-alley/engine` |

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `docs/adr/0008-colyseus-0.18.md` | create | Status Accepted. Context: DT-08 high advisory on the server path. Decision: migrate to Colyseus 0.18 before M2-a code. Consequences: `client.id` removed (use `sessionId`); `setMetadata` replaces the object; reconnection via `allowReconnection` |
| `docs/adr/README.md` | modify | Add row 0008 |
| `backend/game-server/package.json` | modify | Dependencies at the versions in section 2; keep `tsx` dev script |
| `backend/game-server/src/main.ts` | modify | Create the 0.18 server with `WebSocketTransport`, define `battle` room, listen on `GAME_SERVER_PORT` |
| `backend/game-server/src/map.ts` | create | Exports `BOARD` (8×8, width 8, height 8, levels array of 64 integers, three levels) and `ROSTER` (the three unit specs for team A and team B) |
| `backend/game-server/src/protocol.ts` | create | Message names and payload types (section 5). Single source for server and client |
| `backend/game-server/src/bot.ts` | create | `chooseBotAction(state, team): Action` (section 4.5) |
| `backend/game-server/src/battle-room.ts` | create | `BattleRoom` class (section 4.4) |
| `backend/game-server/src/*.test.ts` | create | Tests in section 6 |

Do not touch `backend/engine/`. If a step seems to need an engine change, stop and report it.

### 4. Contracts

**4.1 Engine calls used**
- `newMatch(setup: MatchSetup): MatchState`
- `applyAction(state: MatchState, action: Action): ActionResult` where `ActionResult` is `{ ok: true; state; events }` or `{ ok: false; reason }`
- `publicState(state): PublicState`
- `isGameOver` is NOT exported. Detect the end by `applyAction` returning `game-over`, or by checking `state.units` for a team with no unit where `defeated === false` and `permanentlyDead === false` and not a body. Use a helper in `battle-room.ts` named `teamHasLivingUnit(state, team)`: a unit is living when `!unit.defeated`.

**4.2 Room options:** `onCreate` takes no options. Each room is one match.

**4.3 Actions from the client:** message `action` carries an `Action` without `actor`: `{ type: 'move', to }`, `{ type: 'attack', target }`, `{ type: 'reload' }`, `{ type: 'endTurn' }`. The server adds `actor` = the id of the current unit, but only if the current unit belongs to the sender's team. Otherwise it replies `rejected` with `not-your-turn`.

**4.4 BattleRoom behaviour**
- `onCreate`: build `MatchSetup` from `map.ts` (seed fixed at 1 for M2-a), call `newMatch`, store in `this.match`. Store `this.humanSessionId = null` and `this.botTeam = 'B'`.
- `onJoin(client)`: if `humanSessionId` is set and differs from `client.sessionId`, throw an error with message `room full`. Otherwise set `humanSessionId = client.sessionId`, and send `state` with `publicState(this.match)`.
- `onMessage('action', payload)`: described in 4.3. On accepted: store the new state, broadcast `events` and `state`, then run the bot (4.4.1). On rejected: send `rejected` to the sender only.
- 4.4.1 Bot loop: while the current unit is on team B and no team is defeated: call `chooseBotAction`, `applyAction`, store, broadcast `events` and `state`. Stop after 50 iterations as a guard against a loop; if the guard trips, end the match as a forfeit for the bot and log an error.
- When a team has no living unit: broadcast `ended` with `{ winner: 'A' | 'B' }`. Refuse further actions with `rejected` reason `game-over`.
- `onDrop(client)`: `this.allowReconnection(client, 120)`.
- `onReconnect(client)`: send `state` to that client.
- `onLeave(client, consented)`: if the leaving client is the human and not reconnected, end the match with `ended` winner `B` and dispose the room.

**4.5 Bot (`chooseBotAction(state, team)`)**
- Candidate actions for the current unit: `endTurn`; `move` to each of its 8 neighbours that are inside the board; `attack` each enemy; `reload` if the unit has a magazine that is not full.
- Keep only candidates that `applyAction(state, candidate)` accepts. The result is used only to check legality; never read `rng` or the events to score.
- Score (integer, higher is better): attack on an enemy the unit can kill (expected damage at least its health) = 100; attack otherwise = `hitChance * attack`; move that reduces distance to the nearest enemy = 10; move onto a higher level = 5; if unit health is below half its maximum (use the setup value) the moves that increase distance to the nearest enemy = 20 each; reload when the magazine is empty = 15; `endTurn` = 0.
- Pick the highest score. Ties broken by candidate order (the order of section 4.5's list). Deterministic for a given state.

**4.6 Map.** `map.ts` levels: row-major array, `levels[y * 8 + x]`. Put level 1 on (2,2),(3,2),(2,3),(3,3) and level 2 on (3,3). Units: team A at (0,0),(1,0),(0,1); team B at (7,7),(6,7),(7,6). Sniper range 3 and magazine 3; Wizard and Priest range 1, magazine null; attack and health values are fixtures (Sniper attack 4, health 12; Wizard attack 3, health 14; Priest attack 2, health 16).

### 5. Protocol (`protocol.ts`)

Message names: `action` (client to server), `state` (server to client), `events` (server to client), `rejected` (server to client), `ended` (server to client).

Payloads: `state`: `PublicState` from the engine. `events`: `Event[]`. `rejected`: `{ reason: RejectReason }`. `ended`: `{ winner: 'A' | 'B' }`.

Export a constant `PROTOCOL_VERSION = 1`. The server sends it on join inside a `state` message as `{ version, state }`. Make `state` payload `{ version: number; state: PublicState }`.

### 6. Tests planned

Unit (vitest in `backend/game-server`, use the room through the Colyseus testing API if available in 0.18; otherwise test the pure functions):
- [ ] `chooseBotAction` returns a legal action (accepted by `applyAction`) for 100 generated states.
- [ ] `chooseBotAction` is deterministic: the same state gives the same action on two calls.
- [ ] `chooseBotAction` prefers a kill over a plain attack when both are legal.
- [ ] The room refuses a second human (`room full`).
- [ ] An action from the human with the bot's unit current is answered with `rejected: not-your-turn`.
- [ ] After an accepted human action, the bot plays until it is the human's turn or the match ends.
- [ ] A reconnect with the same `sessionId` inside the window receives a `state` message.
- [ ] A drop that is not followed by a reconnect ends the match with `ended` winner `B`.

Integration (Node, no browser):
- [ ] A scripted human client that always attacks when it can, else moves toward the nearest enemy, else ends its turn, plays a full match to `ended` within 500 actions, and every `events` it receives applied with `applyEvents` from the same setup gives the same state as the last `state` message.

### 7. Execution steps (in this order)

1. Check the installed versions: `npm view colyseus version`, `npm view @colyseus/sdk version`. Record them in ADR 0008. If the versions are not 0.18.x, stop and report.
2. Update `backend/game-server/package.json` to the section 2 versions. Run `npm install` at the repository root. Run `npm test -w @eldritch-alley/game-server` once to confirm the toolchain.
3. Write ADR 0008 and add it to the index.
4. Write `map.ts`, then `protocol.ts`.
5. Write `bot.ts` with its unit tests first (red), then the implementation (green).
6. Write `battle-room.ts` and `main.ts`. Write the room tests first where possible.
7. Write the integration test (section 6, last group). Run the whole suite: `npm test`, `npm run typecheck`, `npm run build`.

### 8. Acceptance

- [ ] All tests in section 6 pass.
- [ ] `npm run typecheck` and `npm run build` pass.
- [ ] `npm audit` shows no high advisory whose package path starts at `@colyseus/*` or `colyseus` (the `nanoid` high must be gone). Record the result in `technical-debt.md` as DT-08 closed for the server path.
- [ ] No file under `backend/engine/` changed.

### 9. Out of scope

Lobby, scenes, rendering and any browser code (frontend plans). Deploy and tunnel (M2-b). Timer (M5). Login and accounts (M4). Schema-based state sync.
