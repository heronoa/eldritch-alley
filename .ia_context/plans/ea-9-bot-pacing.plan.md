# Plan: EA-9 · Bot turn pacing

**Milestone:** lot 3 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-3 (the "Vez do inimigo" banner); EA-12 (camera follows the acting unit), for the camera part only
**Created:** 2026-10-05
**Status:** ready for review

## 0. Findings

- `playBotTurns` (`backend/game-server/src/battle-room.ts`) runs the whole bot turn in one synchronous loop and publishes each action at once. The client receives every bot action in a single burst, with no time between them.
- The server's state is final when the client receives the burst. A delay on the server would change room timing and add a timer outside the engine, for no gain in authority.

## 1. Objective

The bot pauses between its moves and its attacks, so the player can follow what happened. The camera follows the acting bot unit (after EA-12). The banner "Vez do inimigo" shows at the start of the bot's turn (EA-3).

## 2. Decision of place (proposed)

Pacing is in the **client's presentation queue**, not on the server:
- The server keeps publishing the same events, all at once. Authority and determinism are unchanged (rule 2).
- The client holds the events it receives and plays them one after another, with a pause between bot actions (about 600 ms for a move, 900 ms before an attack). The state the player sees is the state after each event.
- No timer runs on the server, so the room stays deterministic and testable.

The alternative (server delays between bot actions) is recorded as D1.

## 3. Changes by layer

### Server (`backend/game-server`)

No change under the recommended option (D1-A).

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/game/presentation-queue.ts` | create | Pure queue of server messages with durations. `enqueue(messages)`, `next(now)`. A bot action is a unit of playback; a human action plays at once |
| `src/game/presentation-queue.test.ts` | create | Section 4 |
| `src/game/presentation.ts` | modify | Existing presentation of events is driven by the queue; the state shown is the state after the last played event |
| `src/scenes/MatchScene.ts` | modify | Input is blocked while the bot's queue plays; the human cannot act during the bot's turn (already true at the engine level, now also visible) |
| `src/scenes/HudScene.ts` | modify | "Vez do inimigo" banner at the start of the bot turn (EA-3's `bannerFor`) |
| Camera follow (EA-12) | modify | When a bot action plays, the camera pans to the acting unit |

## 4. Contract of the layer

- **`presentation-queue`**: `enqueue(messages: ServerMessage[])` appends; `next(now): { message, duration } | null` returns the next playable message once its pause has elapsed. Pure, time passed in.
- **Pauses**: move 600 ms, attack 900 ms, reload and meditation 900 ms, end of bot turn 400 ms. Constants in one module, for tuning.
- **Not done by this layer:** the bot's choice of action (EA-10), engine rules, server timing.

## 5. Tests planned

Unit (`presentation-queue.test.ts`):
- [ ] A bot batch of move, attack, end turn plays in order with the pauses above.
- [ ] A human action plays with no pause.
- [ ] `next(now)` returns null before the pause ends, and the message after.
- [ ] Messages enqueued during playback play after the current one, in order.
- [ ] An empty queue returns null.

Client (manual, with a test match):
- [ ] The banner shows at the start of the bot turn.
- [ ] The camera follows the bot unit (after EA-12).
- [ ] The player cannot click during the bot's playback.

## 6. Dependencies

- EA-3 (banner). EA-12 for the camera part; the pacing ships without it, the camera follow ships with EA-12.
- EA-10 changes the bot's choices; pacing works with any choice.

## 7. Decisions (proposed, not yet confirmed)

- **D1. Where the pause lives.**
  - A. Client presentation queue. No server timer; the room is unchanged. **Recommended.**
  - B. Server delays between bot actions. The room needs timers, and a disconnected client misses the pace; harder to test.
- **D2. Pause durations:** the values above are a first guess; tune on a phone after the first playtest.

## 8. Out of scope

- Bot choices (EA-10).
- Turn timers for humans (ADR 0004, M5).
- Sound (DT-56).
