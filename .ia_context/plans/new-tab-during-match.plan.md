# Plan — Second tab during a match: say so, instead of "Server unavailable" (DT-68)

**Milestone:** — (single frontend plan, no server change, no protocol change)
**Parent debts:** [DT-68](../inputs/technical-debt.md) (a second tab during a match reports the wrong reason)
**Created on:** 2026-10-05
**Status:** implemented on 2026-10-05; the four browser checks of section 6 have not been run yet, so DT-68 is still open in [technical-debt.md](../inputs/technical-debt.md). Frontend suite 385/385 in 37 files, `npm run build` green, `battle-room.test.ts` 9/9. Two divergences from the plan's own text are recorded in section 4.

---

### 1. Objective

A player who opens a second tab while a match is open gets a line that names the real cause — the match is open in another tab — instead of the generic "Server unavailable". The server keeps refusing the second join exactly as it does today; only the client learns to read that refusal.

---

### 2. Why the new tab is refused

Recorded so the next reader does not re-derive it:

- `sessionStorage` is per tab, so a second tab has no reconnection token. `Session.open()` (`frontend/src/net/session.ts`) tries `reconnect()`, gets `false`, and falls through to `connect()`.
- `gameServer.define(ROOM_NAME, BattleRoom)` sets no `maxClients`, and `findOneRoomAvailable` (`@colyseus/core` `build/MatchMaker.cjs:248`) filters only on `{ locked, name, private, ...getFilterOptions() }` — **capacity is not a criterion**. The matchmaker therefore hands the second tab the room that is already in use.
- `BattleRoom.onJoin` (`backend/game-server/src/battle-room.ts:105-111`) is the only admission guard. It compares `humanSessionId` and throws `Error('room full')`.
- The title catches everything the same way and renders `title.unavailable` ("Servidor indisponível"), which is true of nothing here.

**Never set `maxClients` on the room.** It looks like the proper fix and makes things worse: `Room._reserveSeat` (`build/Room.cjs:1333`) would return `false`, `reserveSeatFor` would raise `SeatReservationError`, and `joinOrCreate` would retry five times against the same room (`build/MatchMaker.cjs:167`, `retry(..., 5, [SeatReservationError])`) before failing with a Colyseus error. The message the client sees would stop being `room full`, and the warning would silently disappear.

---

### 3. Decisions taken

Answered by the owner on 2026-10-05.

**D1 — How the client recognises the refusal — chosen: match the `room full` message.**

- **Chosen.** The client matches the server's message. No server change, no protocol change. Verified that the message reaches the client: `battle-room.test.ts:80` asserts `rejects.toThrow(/room full/)`.
- Accepted cost: a server string crosses the boundary as an implicit contract, and changing the `throw` text would silently revert the screen to the generic line. Mitigated by keeping the string in exactly one place and pinning it with a test on both sides (section 4).
- Not done: a `ServerError` with an application code (more robust, but the SDK's propagation of the code to the `joinOrCreate` rejection was not verified, and it would make this a two-layer plan), and refusing through the protocol the way `WireRejectReason` does for actions.

**D2 — Where the reason lives — chosen: a field on the `failed` state.**

- **Chosen.** `Flow` gains `failure`, and no new state is added. The module keeps its four states and its existing transitions, and the button keeps answering in `failed`, which is what makes the retry path work unchanged.
- Not done: a fifth `occupied` state (more explicit, but more transitions to test and the button would have to answer in it too), and holding the reason in the title outside the flow (avoids the pure module, but splits one fact across two places).

**D3 — The wording — chosen: name the other tab.**

- **Chosen.** pt-BR `Você já tem uma partida aberta em outra aba`, en-US `You already have a match open in another tab`. True in both situations that produce the refusal today: a match in progress, and a finished match whose result screen is still open (the room is not left until "Voltar ao início", `frontend/src/scenes/MatchScene.ts:197-198,426`).
- **Known debt, inherited by the identity ADR.** Once PvP exists, `room full` will mean "another player is in this battle", and this line becomes wrong. The plan that introduces player identity must revisit it.

---

### 4. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/net/join-failure.ts` | create | `joinFailure(error: unknown): JoinFailure`. The only place in the client that knows the `room full` string |
| `frontend/src/net/join-failure.test.ts` | create | Cases in section 5 |
| `frontend/src/title/connect-flow.ts` | modify | `Flow` gains `failure`. `next` takes the reason with the `failed` event |
| `frontend/src/title/connect-flow.test.ts` | modify | Cases in section 5 |
| `frontend/src/title/copy.ts` | modify | `TitleCopy` gains `occupied`, read from `title.occupied` |
| `frontend/src/i18n/catalog.pt-BR.ts` | modify | `'title.occupied'` |
| `frontend/src/i18n/catalog.en-US.ts` | modify | `'title.occupied'` |
| `frontend/src/i18n/catalog.test.ts` | modify | Pins both new strings, next to the `title.unavailable` pins |
| `frontend/src/title/copy.test.ts` | modify | The catalog stub gains the key |
| `frontend/src/title/title.ts` | modify | `press()` passes the caught error to `fail()`; `renderFlow` picks the line from `flow.failure` |
| `.ia_context/inputs/technical-debt-closed.md` | modify | On completion: closes DT-68 with its resolution. The item is already registered in `technical-debt.md`, written when this plan was created |

`frontend/src/net/session.ts` is **not** changed: `open()` already lets the error out of `connect()` unchanged, and `session.test.ts` already covers that with "throws the join error when the resumption fails and the new room does too".

Two corrections to the table above, made when it was implemented:

- **`copy.test.ts` has no catalog stub.** The table said its stub would gain the key; the file reads the real catalog through `setLocale`, as it already did for `title.unavailable`. The line is therefore pinned there directly, in both locales — the same duplication `catalog.test.ts` carries on purpose, and the idiom this file already had.
- **`backend/game-server/src/battle-room.test.ts` is missing from the table** but is asked for by section 6. It gained a comment, no assertion: the case already asserts the string, and the comment records that `join-failure.ts` is what reads it. Nothing else in `backend/` changed.

`backend/` is **not** changed. The protocol is **not** changed.

---

### 5. Contracts

**`joinFailure(error: unknown): JoinFailure`** (`frontend/src/net/join-failure.ts`)

- **Input:** whatever a `catch` was handed. Not assumed to be an `Error`.
- **Output:** `'occupied'` when the error is the room's refusal, `'unavailable'` for everything else.
- **Never throws.** A `null`, an `undefined` or a bare string answers `'unavailable'`.
- **What it does not do:** it does not retry, does not close the other tab, does not talk to the server, and does not decide what the screen says.

**`Flow.failure: JoinFailure | null`** (`frontend/src/title/connect-flow.ts`)

- `null` in every state but `failed`.
- Set by the `failed` event, cleared by the next `press` back to `connecting`, and cleared with the flow itself in `resume()`.

**`next(flow, event, now, failure?)`**

- The fourth argument is meaningful only for the `failed` event and defaults to `'unavailable'`, so the existing call sites keep their meaning: a failure with no diagnosis is the generic one.

**`TitleCopy.occupied`**

- The line the title shows when `flow.failure === 'occupied'`. `TitleCopy.unavailable` keeps its meaning for every other failure.

---

### 6. Tests

Automated:

- [x] `join-failure.test.ts` — an `Error` carrying the room's message answers `'occupied'`; an `Error` carrying anything else answers `'unavailable'`; a non-`Error` value (a string, `null`, `undefined`) answers `'unavailable'` without throwing. — 3 cases: "reads the room's own refusal as an occupied seat", "reads every other error as the server being unavailable", "reads a value that is not an error at all, and never throws"
- [x] `connect-flow.test.ts` — a failure carries the reason it was given; a failure with no reason carries `'unavailable'`; a press from `failed` returns to `connecting` and clears the reason; the existing transitions are unchanged. — 4 new cases under "the reason a failure carries"; the 9 existing ones now carry `failure: null` in their literals. 13/13.
- [x] `catalog.test.ts` — both catalogs carry `title.occupied`, each pinned to its exact string, so changing the wording is a deliberate edit. — one line in each of the two title blocks. 18/18.
- [x] `copy.test.ts` — `titleCopy()` exposes `occupied` alongside `unavailable`. — one line in each locale block. 6/6.
- [x] `session.test.ts` — unchanged. The existing "throws the join error when the resumption fails and the new room does too" is what guarantees the classification has an error to read. — untouched, 20/20.
- [x] Pin the other side of the contract: `battle-room.test.ts` already asserts the thrown message with `/room full/`. Leave it as the record of the string the client depends on, and say so in a comment — if it is ever reworded, this plan's warning stops working. — a comment above the case names `join-failure.ts` as the reader and the failure mode. 9/9.

The client half of that string was also confirmed before it was trusted: `onJoin`'s `Error('room full')` is **rethrown unchanged** by `wrapTryCatch` (`@colyseus/core`, `utils/Utils.cjs:118`, `rethrow = true`), propagates out of `connectClientToRoom` (`Transport.cjs:161`), and the transport puts it on the wire as `client.error(e.code, e.message)` (`@colyseus/ws-transport`, `WebSocketTransport.cjs:227-243`). The message therefore arrives verbatim, and because the thrown value is a plain `Error` its `code` arrives `undefined` — which is what ruled out the code-based variant of D1 without a server change.

Manual, in the browser (`npm run dev`):

- [ ] Start a match, open a second tab, press the button there: the warning names the other tab, and it is not "Server unavailable".
- [ ] Back in the first tab, the match is still there and still playable.
- [ ] Let a match end, keep the result screen open, open a second tab and press: the same warning.
- [ ] With the server unreachable, press: still the generic "Server unavailable", so the new line did not swallow real failures.

Command: `npm test` and `npm run build` in `frontend/`.

---

### 7. Dependencies

- None. Base `develop`, which already carries the DT-60 work (`d4da8aa`).
- The identity ADR and its plan are a **separate** track, decided with the owner: this plan goes first, identity after.

---

### 8. Out of scope

- **Routing the second tab into its own battle.** Offered and rejected by the owner; it needs `findOneRoomAvailable` to stop offering an occupied room, which the matchmaker does not do out of the box.
- **Letting the second tab into the existing match**, in progress or finished, and **the 120 s room lifetime after a match ends**, and **`onReconnect` not resending `ended`** so a resumed finished match shows no result UI. All three need player identity on the game server, and belong to the identity ADR and its plan.
- **Any change to `backend/`, the protocol, or the room's admission rule.** The guard stays in `onJoin`.
- **`maxClients`.** Explicitly forbidden; see section 2.
- **DT-66** (the `room full` error printed by the server test suite) stays open. This plan leans on that same message, so it is worth closing next, but not here.
- **The visual look of the title.** The line reuses the existing `alert` element and the existing failure styling.
