# Plan — M2-a frontend integration: scenes and a full match against the bot

**Milestone:** m2a-integration
**Feature pai:** [m2a.index.md](m2a.index.md)
**Created on:** 2026-10-03
**Status:** pendente

---

### 1. Objective

Connect the logic from `m2a-logic` to Phaser scenes so a person can play a complete match against the bot in the browser, and recover from a forced disconnect by reconnecting. Adds the lobby, the match scene and the log panel.

### 2. Prerequisites

- `m2a-server` and `m2a-logic` approved.
- A running game server (`npm run dev:game-server`) for manual checks.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/scenes/LobbyScene.ts` | create | One button "Jogar contra o bot". Creates a `Session`, connects, and starts `MatchScene` with the session |
| `frontend/src/scenes/MatchScene.ts` | create | Draws the grid with `grid.ts` and `heightColor`; draws units as labelled rectangles (initial letter: S, W, P; team A uses a light colour, team B a dark one); highlights the selected unit; handles clicks through `resolveClick`; sends actions through `Session`; shows the log from `describeEvent`; shows "Reconectando..." on drop and calls `session.reconnect()`; shows the winner on `ended` |
| `frontend/src/scenes/BootScene.ts` | modify | After the title, start `LobbyScene` on a key press or after 1 second |
| `frontend/src/main.ts` | modify | Register `LobbyScene` and `MatchScene` in the scene list |
| `backend/game-server/src/integration.test.ts` | modify or create | The full-match test from `m2a-server` section 6 (server side only) |
| `frontend/src/view/*.ts`, `frontend/src/game/*.ts` | read only | Use as they are; if a change is needed, stop and report |

### 4. Contracts

**4.1 `LobbyScene`**
- `create()` shows the button. On click, it creates one `Session` with endpoint from `import.meta.env.VITE_GAME_SERVER ?? 'ws://localhost:2567'`, awaits `connect()`, then `this.scene.start('match', { session })`.
- If `connect()` rejects, show the text "Servidor indisponível" and keep the button.

**4.2 `MatchScene`**
- `init(data: { session: Session })` stores the session.
- `create()`: subscribes to `onState`, `onEvents`, `onRejected`, `onEnded`. Keeps `this.state`, `this.selectedId`, and the log array (last 8 lines).
- Clicks: convert the pointer to a cell with `pixelToCell`; call `resolveClick` with the human team `'A'`; for `send`, call `session.send(action)`; for `select`, set `selectedId` and redraw.
- On `rejected`, append the reason to the log and keep the selection.
- On `onState`, redraw everything from the public state. The state message is `{ version, state }`; check `version === PROTOCOL_VERSION` and show "Versão incompatível" otherwise.
- On drop (SDK disconnect event through `Session`), show "Reconectando..." and call `session.reconnect()`. If it returns `false`, show "Partida perdida" and stop.
- On `onEnded`, show "Vitória" or "Derrota" from the winner and disable clicks.

**4.3 Drawing rules (layout only; colours come from `heightColor`)**
- Grid cells: squares of `TILE_SIZE`, fill `heightColor(level)`, 1 px stroke.
- Units: rectangles of 36 px centred on the cell, with the initial letter in white; selected unit has a 3 px yellow stroke.
- Log panel: 8 lines of text to the right of the grid, starting at x = 440.

**4.4 Frontend test**
- Phaser scenes are not unit-tested. The full-match check is the server integration test (section 6, step 7 of `m2a-server`), run through the protocol without a browser. Add it here, in `backend/game-server/src/integration.test.ts`, if it was not already written in the server plan.

### 5. Tests planned

Automated:
- [ ] The server integration test (full match against the bot, applying events to a copy of the setup and comparing with the last `state`) passes.

Manual, in a browser at `http://localhost:5173` with the server running:
- [ ] Clicking "Jogar contra o bot" opens the match with a 8×8 grid, three units per team, and the log empty.
- [ ] Selecting a human unit highlights it; clicking an enemy in range sends an attack and the log shows the result.
- [ ] Clicking an adjacent empty cell moves the unit and updates its drawn position.
- [ ] A rejected action (for example, clicking an enemy out of range) shows the reason in the log and keeps the selection.
- [ ] A match plays until one side is eliminated, and the screen shows "Vitória" or "Derrota".
- [ ] While a match is running, stop the server and start it again within 120 seconds. The client shows "Reconectando..." and returns to the same state. Repeat with a wait longer than 120 seconds: the client shows "Partida perdida".
- [ ] Refreshing the page during a match: the client reconnects with the stored token and resumes.

### 6. Dependencies

- `m2a-server` and `m2a-logic` approved.
- Node 22, the game server running locally.

### 7. Execution steps

1. Write `LobbyScene.ts` and register it. Check the lobby manually.
2. Write `MatchScene.ts` in three parts: drawing, clicks, server messages. Check each part manually before the next.
3. Add the reconnection path. Check it manually with the 120 s rule.
4. Run the server integration test and `npm run build -w @eldritch-alley/frontend`.

### 8. Acceptance

- [ ] Section 5 automated check passes.
- [ ] Every manual item in section 5 is checked by the reviewer in a browser, with the result written in the PR.
- [ ] No change under `frontend/src/view/` or `frontend/src/game/` (read only here).

### 9. Out of scope

Visual design beyond the layout in section 4.3 (design plan). Deploy. The tunnel tests (M2-b).
