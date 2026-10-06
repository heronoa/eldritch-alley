# Plan: EA-5 · One area at a time: movement, then attack

**Milestone:** lot 2 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Requires:** EA-1 (line of sight), EA-2 (reachable cells, shared with the server), EA-4 (automatic end of turn)
**Created:** 2026-10-05
**Revised:** 2026-10-06 — the threat layer was removed, pending movement added (sections 6 and 7)
**Status:** ready for review

## 1. Objective

The board shows one area at a time: the area of the question the turn is asking right now. Two areas are never painted together.

```
Idle ──Move──▶ ChoosingDestination ──click a cell──▶ MovePending ──any action──▶ Committed
                (blue only: reachable)               (red only: attackArea     that is not      (no undo)
                                                      from the current cell)    another move
                                                        │   ▲                   (attack, spell,
                                                        │   └── move again      item, reload, end
                                                        │       (stays          turn) or Confirm
                                                        │        pending)       move
                       ◀──── Cancel move ───────────────┘
                       (back to the cell of the first pending move,
                        movement restored, state returns to Idle)

Idle ──Attack──▶ (red only: attackArea from the current cell) ──target──▶ Committed
```

Selecting a unit of the team with the turn shows the area of the state that turn is in. While the player is choosing a destination, only the cells the unit can reach this turn are painted. While the unit stands on a destination it has not committed, and once the player arms the attack, only the cells the unit can attack from where it stands are painted.

A move stays pending until it is committed, and a pending move can be taken back: the unit returns to the cell it stood on before the first move of the run, with the movement that run spent given back. The commit is what makes the movement final, and it happens on the first action that is not another move.

## 2. Changes by layer

### Engine (`backend/engine`)

| File | Operation | What changes |
|---|---|---|
| `src/attack.ts` | create | `attackArea(state, from, unit): Position[]`: cells within the unit's reach of `from` with line of sight from `from` (EA-1). No `threatArea` |
| `src/attack.test.ts` | create | Section 4 |
| `src/types.ts` | modify | `MatchState.pendingMove`; the `cancelMove` and `commitMove` actions; the `move-cancelled` and `move-committed` events; the `no-pending-move` reason |
| `src/actions.ts` | modify | `validateAction` accepts the two new actions; `canStillAct` counts a pending move as something still to do |
| `src/events.ts` | modify | `moved` opens or extends the pending run; `move-cancelled` returns the unit and gives the movement back; any other event commits |
| `src/match.ts` | modify | `newMatch` starts with no pending move |
| `src/index.ts` | modify | Export `attackArea` for the client |

**`attackArea` counts cells, not enemies.** It lists every cell that would be a legal target position, occupied or not. The client decides what a click on each cell means (EA-8).

**Reach and resource.** `attackArea` uses the reach the attack would have now: `range`. Ammunition or mana at zero does not shrink the area in the engine; the client shows the area and the attack refusal reason on click (EA-14). This keeps the highlight independent of the resource state, the same way EA-2 keeps reachability independent of the path choice shown.

**No threat layer.** The union of `attackArea` over the reachable cells is exactly the anticipation this ticket removes. Reason and date in section 6.

### Server (`backend/game-server`)

| File | Operation | What changes |
|---|---|---|
| `src/action-shape.ts` | modify | `isClientAction` accepts `cancelMove` and `commitMove` (no fields, like `reload`) |
| `src/protocol.ts` | modify | Mirrors the two new client actions; protocol version bump (ADR 0010) |
| `src/battle-room.ts` | no change | The room relays the actions as they are |
| `src/bot.ts` | no change | It never cancels, so it never sends `cancelMove`. It does not send `commitMove` either: its run is closed by the next thing it does (section 6, D7) |
| `src/bot.test.ts` | modify | Section 4 |

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/protocol.ts` | modify | Mirrors the two new client actions |
| `src/game/highlight.ts` | modify | One set per state: reachable in ChoosingDestination, `attackArea` from the current cell in MovePending and in the attack. Never both |
| `src/game/selection.ts` | modify | The click rules per state. The move keeps its two taps (EA-7); the pending state changes what the second tap means |
| `src/game/actions.ts` | modify | The two chips, "Confirm move" and "Cancel move", offered only with a pending move |
| `src/scenes/MatchScene.ts` | modify | Paints the set of the state; sends `cancelMove` and `commitMove`; the pending state holds the automatic end of turn back |
| `src/scenes/HudScene.ts` | modify | Draws the two chips over the map, above the Move button (the end-turn hint keeps its own line, `src/scenes/HudScene.ts:193`) |
| `src/view/layout.ts` | modify | Rectangles for the two chips, outside the bar; the end-turn hint moves up to clear them |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | Labels for the two controls, and the legend line |
| Tests: `highlight.test.ts`, `selection.test.ts`, `actions.test.ts` | modify | Section 4 |

**Colours.** No new tone. The two tones already in the theme are reused unchanged: `HIGHLIGHT_MOVE_COLOR` for reachable and `HIGHLIGHT_ATTACK_COLOR` for the attack area (`src/view/theme.ts:72-75`, drawn at `src/scenes/MatchScene.ts:649`). The third, dimmer tone the first revision asked for goes away with the threat layer.

**The two chips float above the Move button.** The action bar is exactly full — `ACTION_BAR_RECT` is 784 px and the four buttons and three gaps fill it exactly (`src/view/layout.ts:51-54`) — so the chips sit outside it, over the map, one row above the first button (`buttonRect(0)`, the Move button, `src/view/layout.ts:200-208`). That band is today `ACTION_HINT_RECT`, EA-4's hint for the "End turn" button, which takes no click of its own (`src/view/layout.ts:151-160`, drawn at `src/scenes/HudScene.ts:193`); the hint moves up to give the chips the band, keeping its own line and its width. The exact rectangles are `layout.ts`'s to fix (section 6, D6).

**The automatic end of turn keeps the countdown it has.** `availableActions(...).nothingLeft` already reads `canStillAct` (`src/game/actions.ts:101`), and the countdown it feeds is EA-4's, client-side, `AUTO_END_TURN_MS = 2000` (`src/game/autoEndTurn.ts:14`). This ticket touches neither: once the engine answers that a pending move is something left to do, the countdown waits by itself.

## 3. Contract of the layer

- **`attackArea(state, from, unit): Position[]`**: cells at distance 1..`unit.range` from `from`, with line of sight from `from` (EA-1), inside the board. Pure. Does not depend on whose turn it is and does not depend on the unit's ammunition. Empty for a defeated unit.
- **Pending move.** `MatchState.pendingMove: { from: Position; cost: number } | null`. `null` in Idle and in Committed. `from` is the cell the run started on; `cost` is what the run has spent so far. The acting unit is the one on turn, so the field does not carry a unit id, the way `movementLeft` and `hasActed` already do not.
- **`move`** applies as it does today (spend, then move) and then, when no run is open, opens one with `from` at the cell it started on; an open run keeps its origin and grows its `cost`.
- **`cancelMove` action.** Accepted only with an open run, otherwise refused with `no-pending-move`. Emits `move-cancelled`: the unit returns to `from` and `movementLeft` gets the run's `cost` back, so what comes back is proportional to what was spent — a run that spent everything gives everything back, a run that spent half gives half. The run closes.
- **`commitMove` action.** Accepted only with an open run, otherwise refused with `no-pending-move`. Emits `move-committed`: the run closes. No other effect — it spends no action and does not end the turn. Named `commitMove` in the engine to leave `confirmMove` (the client's second tap, `src/game/selection.ts:96`) its name.
- **What commits.** Any action that is not `move`: `attack`, `reload`, `endTurn`, `commitMove`, and, once they exist, spells and items (M3). The commit is immediate — no countdown, no confirmation. In the engine it lives in `applyEvent`: an event that is not `moved` closes the run, so a replay rebuilds the same state (`src/events.ts` is the only place match state changes).
- **The automatic end of turn.** `canStillAct` answers true while a run is open, whatever else is spent. A pending move is not an exhausted resource; the pass is only evaluated again after the commit.
- **The bot never cancels, and it never confirms.** Its run is committed by its next action — the attack, the reload or the end turn it was going to play anyway (section 6, D7). Both chips are actions only a human sends.
- **Not done by this layer:** inspecting a unit that is not on turn (EA-6), targeting clicks (EA-8), resource refusals (EA-14), reactions (M3).

## 4. Tests planned

Engine (`attack.test.ts`):
- [ ] Attack area of a Sniper at range 3 on open ground: the 7×7 square minus its own cell.
- [ ] A building between the unit and a cell removes the cells behind it (EA-1 rule).
- [ ] Attack area ignores occupancy: an enemy cell and an empty cell are both included.
- [ ] Defeated unit: empty area.

Engine (pending movement — `actions.test.ts` / `events.test.ts`):
- [ ] Cancelling in MovePending returns the unit to the origin with the movement the run spent given back.
- [ ] A run that spent half the budget gives half of it back; a run that spent all of it gives all of it back.
- [ ] Two pending moves in a row, then cancel: back to the origin of the first one, with the cost of both given back.
- [ ] A bot turn (`backend/game-server/src/bot.test.ts`) sends neither `cancelMove` nor `commitMove`: its run is closed by the next action it plays.
- [ ] `attack`, `reload`, `endTurn` and `commitMove` commit the pending move; a cancel after any of them is refused with `no-pending-move`.
- [ ] `commitMove` commits without executing an action and without ending the turn: the unit stays on turn with the same movement left.
- [ ] `commitMove` is only accepted with a pending move (Idle and Committed are refused).
- [ ] A cancel without having moved is refused with `no-pending-move`.
- [ ] With a pending move the automatic pass does not happen, even with everything else spent (`canStillAct` is true).
- [ ] After the commit, with everything spent, the automatic pass happens (`canStillAct` is false).
- [ ] A replay of a turn with a pending move, a cancel and a commit rebuilds the same state and the same hash.

Client:
- [ ] The ChoosingDestination highlight is exactly `reachableCells` and holds no cell of `attackArea`.
- [ ] The MovePending highlight is exactly `attackArea` from the current cell and holds no reachable cell.
- [ ] No state paints movement and attack together.
- [ ] The action bar offers "Confirm move" only with a pending move.
- [ ] A pending move never sends an action by itself.

## 5. Dependencies

- EA-1, EA-2 merged (line of sight, `reachableCells`).
- EA-4 merged: it owns the automatic pass and the question `canStillAct` answers. This ticket changes that answer, not the countdown.
- EA-6 reuses `attackArea` to inspect a unit that is not on turn.
- EA-8 reads the same attack area for the click target.

## 6. Decisions

### Decided (owner, 2026-10-06)

- **D1. One area per state.** The board shows the area of the question the turn is asking, and never two at once: reachable while choosing a destination, `attackArea` from the current cell while a move is pending and while attacking. A highlight that combines the two would be answering a question the game has not asked yet.
- **D2. The threat layer is removed.** `threatArea`, the union of `attackArea` over the reachable cells, is dropped from this plan, from `src/attack.ts` and from the sections that listed it (EA-6 included). Reason: it answers "what would I threaten if I moved" before the player has decided to move, which is the anticipation the one-area rule forbids; it also needs a third tone and a toggle, both of which only existed to serve it. It is not kept "for later": if a future ticket needs it, it is written then, with its own justification.
- **D3. A move is pending until it is committed.** The unit that moved keeps the cell the run started on, and the movement the run spent, until an action that is not another move commits it. Cancelling is valid only while the move is pending and returns the unit to that cell with the movement given back.
- **D4. Confirm move is a control of its own.** It appears only with a pending move and closes the run without executing any other action and without ending the turn.
- **D5. Cancelling gives back what the run spent.** The movement returned is proportional: a run that spent the whole budget gives it all back, a run that spent half gives half. It is not a reset to the turn's full movement.
- **D6. The two controls float above the Move button.** Two chips, "Confirm move" and "Cancel move", over the map and outside the action bar, one row above the Move button. They exist only while a move is pending. EA-4's end-turn hint moves up, keeping its own line, to leave them that band.
- **D7. The bot never cancels and never confirms.** It always moves, and its run is committed by its next action — the second reading: the bot sends no `cancelMove` and no `commitMove`, and the implicit commit of `applyEvent` closes the run. Cancelling and confirming are human options only.

### Open questions

- None.

## 7. Out of scope

- Enemy previews and inspecting a unit that is not on turn (EA-6). It must not read `threatArea`, which no longer exists.
- Attacks by clicking the sprite (EA-8).
- Cover and height bonuses (M3).
- **Reactions.** They do not exist yet (ADR 0003, DT-17). Only what is already decided is recorded, for the ticket that introduces them: they fire on the commit of a move, never while the move is pending and never on a cancel, and they resolve before the action that caused the commit. This ticket does not implement them and creates no hook for them.
