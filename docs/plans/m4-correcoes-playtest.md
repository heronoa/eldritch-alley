# M4 — Playtest fixes

**Created:** 2026-10-14
**Status:** investigation + plan, pending owner approval. No production code was changed to produce this document.
**Roadmap:** [ROADMAP.md](../../ROADMAP.md) — these fixes land inside M4 (Accounts and persistence), ahead of or alongside its own scope; none of them are M4's original items, they are playtest debt raised in parallel.

This plan only investigates and proposes. Every finding below is labelled **Confirmed** (read in the code, with file:line) or **Hypothesis** (plausible, not yet verified, with a way to check it). Nothing is called a "bug" or "root cause" without a direct citation.

## 1. Summary

| # | Problem | Cause | Proposed solution | Effort | Risk |
|---|---|---|---|---|---|
| P1 | Camera rotation seems to invalidate target selection | **Confirmed** (narrow): the hover-driven hit-chance preview is forced to `null` while the camera turns and never restores on its own. **Ruled out**: selection, legal highlighted cells, the move confirm/cancel chips and the action-bar buttons are all state-driven and untouched by rotation/pan/zoom. | Re-run the hover preview when the turn settles; add an Escape-only emergency cancel (not right-click — already "inspect"). | P | Low |
| P2 | Bot turn has no animation; results show before the animation plays | **Confirmed**, different mechanism than hypothesised: the wire protocol already sends ordered events (not a snapshot); the real causes are (a) the server resolves a bot's whole turn in one synchronous loop with zero pacing, and (b) the client has no animation queue — it plays cues fire-and-forget and the sprite's HP bar is redrawn the instant the `state` message lands, before the attack's own impact timer fires. | Client-side animation queue that gates the *visible* result (HP/ammo numbers, log line, cue) on the current cue finishing; add a "bot is acting" / "bot skipped" visible cue. | G | Medium-High |
| P3 | Players skip their turn by accident during transitions | **Confirmed**: `canEndTurn` is unconditionally `true`; the turn banner is a non-interactive overlay that never blocks input; nothing today couples "something is animating/visible" to "input disabled". | Gate the action bar (End Turn especially) on the P2 queue being empty and the banner being gone; ask for confirmation before ending a turn that still has something available. | M | Medium |
| P4 | Bot camps in a good position instead of closing in | **Confirmed**: `endTurn` scores `0` and is the first candidate built; the comparison is strict `>`, so any move/attack that also scores exactly `0` ties and loses to `endTurn`. This happens whenever the bot can't get strictly closer or higher and has no target in range. No stalemate/round-limit mechanism exists anywhere. | Make `endTurn` score negative while an enemy is alive (cheap, bot-only, fixes the confirmed mechanism) + a round cap with a defined tiebreak as the floor that guarantees termination (affects PvP too — owner decision). | P (impatience) / M (round cap) | Low / Medium |

## 2. Per problem

### P1 — Camera rotation and target selection

**Evidence**

- Selection/preview state lives entirely in logical space, as plain fields on `MatchScene`, never in screen coordinates or Phaser objects: `selectedId`, `mode`, `armedAbilityId`, `previewCell` (`frontend/src/scenes/MatchScene.ts:199-220`). `previewCell` is stored already un-rotated via `this.mapCell()` → `unrotateCell(cell, this.viewSteps, ...)` (`MatchScene.ts:1125-1127`), so it is independent of the current view.
- Pan and zoom (`stepZoom`, `snapToWholeStep`, `moveCameraBy`, `centreMap`, `pinchTo`, `MatchScene.ts:1578-1665`) call only `applyCamera()`. None of them call `redraw()` or touch selection fields. **Confirmed: no interaction at all.**
- Rotation (`rotateView` → `settleTurn`, `MatchScene.ts:1047-1089`) calls `buildMap()` then `redraw(this.state)`. `redraw()` only *reads* `selectedId`/`mode`/`armedAbilityId` to recompute what to draw (`drawHighlights` at `MatchScene.ts:1674-1690` passes them into `highlightedCells(...)`; `redrawUnits` marks `selected: unit.id === this.selectedId`). **Confirmed: rotation never resets selection, mode or the armed ability.**
- `updatePreview()` (`MatchScene.ts:497-511`) explicitly nulls the preview while a rotation is in flight:
  ```ts
  if (state === null || this.turn !== null || (this.mode !== 'attack' && this.mode !== 'ability')) {
    this.setPreviewCell(null);
    return;
  }
  ```
  This only runs from `pointermove` (bound at `MatchScene.ts:351`). Once the rotation ends (`settleTurn` sets `this.turn = null`, `MatchScene.ts:1082`), nothing re-invokes `updatePreview()` — the hover-based hit-chance badge (`targetPreviewChances`/`drawTargetPreview`, `MatchScene.ts:523-571`) stays empty until the pointer physically moves again. **Confirmed cause**, reproducible with a mouse: arm attack mode, hover a legal target to see the badge, click the on-screen rotate control (no mouse movement), the badge disappears and does not come back on its own.
- The move confirm/cancel chips (`MoveChip`, `frontend/src/game/actions.ts:152-175`) are driven by `state.pendingMove` (server-authoritative) and drawn/hit-tested at **fixed HUD rects** (`moveChipRect`, `moveChipIndexAt`, `frontend/src/view/layout.ts:254-271`) inside `HudScene`, a separate overlay scene that is never rotated or zoomed (confirmed pattern, see `map-zoom.lesson.md`). **Ruled out**: rotation cannot desync or disable these chips.
- The action-bar buttons' `enabled` state (`actionButtons`/`computeAvailableActions`, `actions.ts:97-150`) depends only on match state (`hasActed`, `reachableCells`, `attackArea`, ability availability) — nothing reads camera/view state. **Ruled out**: rotation cannot disable the action bar.
- No Escape-key handling exists anywhere in the match UI; the only `Escape` hit in the repo is `frontend/src/title/title.ts:374` (closes a connection-failure notice, unrelated). The keydown block (`MatchScene.ts:361-371`) only wires `+`/`-`/pan keys/`q`/`e`.
- Right-click is already bound to "inspect", not cancel (`frontend/src/game/press.ts:16-24,83-84`; consumed at `MatchScene.ts:401-408,801-804`). There is no `cancel` `PressOutcome` in `game/press.ts`.
- The existing "cancel an armed mode" idiom is `pressAction()` (`MatchScene.ts:884-898`): pressing the same mode button again sets `this.mode = 'inspect'` and redraws. This is the de facto cancel today, reachable only by re-clicking the HUD button.

**Cause**

Confirmed, narrow: the hover preview (hit-chance badge) is suppressed during the 450 ms rotation animation and is never recomputed once the rotation settles, because nothing re-reads the last known pointer position at that point. Selection, legal highlights, the move-confirm chips and the action-bar buttons are all unaffected — confirmed by reading the code paths above, not inferred.

**Hypothesis** (not yet verified): the playtest symptom as reported ("preview disappears, confirm button disabled, player can only skip") may be this hover-preview gap combined with the player's disorientation right after a 90° turn — the same screen position now maps to a different cell, so their next clicks land on the wrong or no cell and they conclude the UI is stuck, not that the badge alone vanished. **How to verify**: ask the reporting playtester for the exact input sequence (rotate panel button vs. `Q`/`E` vs. drag-rotate; mouse movement afterwards; what they clicked next) or get a screen recording, since the code does not show any path where a button becomes genuinely disabled by rotation.

**Solution**

1. Re-run the hover preview logic (the `unitAtPoint`/`cellAt`/`setPreviewCell` sequence inside `updatePreview()`) from `settleTurn()` using the last pointer position already tracked by Phaser's input plugin, so the badge reappears without requiring the mouse to move.
2. Emergency exit, independent of the cause: bind `Escape` in the existing keydown handler (`MatchScene.ts:361-371`) to the same reset `pressAction()` already performs when a mode button is toggled off — `this.mode = 'inspect'`, clear `armedAbilityId`, close the ability menu if open, clear `previewCell`, redraw. **Deviation from the task's literal wording** ("Esc ou clique direito"): right-click already means "inspect" in this client; repurposing it would either break an existing, shipped feature or need a new gesture (e.g. long-press-right-click) to disambiguate. Recommendation: ship Escape only, and raise the right-click question to the owner (see § 5).

**Affected files**

- `frontend/src/scenes/MatchScene.ts` (`updatePreview`, `settleTurn`, the keydown block, `pressAction`).

**Acceptance criteria**

- Arming attack or ability mode, hovering a legal target, then rotating the camera (panel button or `Q`/`E`) shows the hit-chance badge again as soon as the rotation settles, without the pointer moving.
- Pressing `Escape` at any point during move/attack/ability aiming returns to the `inspect` mode, clears the armed ability and the preview, and redraws the action bar — from any screen state, including mid-ability-menu.
- Pan, zoom and rotation never change `selectedId`, `mode`, `armedAbilityId` or the legal highlighted cells (regression check, already true today).

**How to test**

- Automated: none of the touched logic is currently in a pure, scene-independent module. Per the project's own convention (`ea-12-camera.lesson.md`: "a debt phrased as 'has no test' is really asking for a design change"), consider extracting "what to recompute when a rotation settles" into a small pure function next to `rotation-animation.ts` if the fix grows past a few lines; otherwise this stays manual-only, same as the rest of `MatchScene`'s gesture wiring.
- Manual script: (1) start a match as the human, arm attack, hover a legal enemy, confirm the badge; (2) click the rotate-right camera panel control without moving the mouse; confirm the badge reappears; (3) repeat for `Q`/`E` and for drag-rotate if that exists; (4) arm ability mode, open the ability menu, press `Escape`, confirm everything resets to `inspect`.

### P2 — Bot turn has no animation; results appear before the animation

**Evidence**

- No Colyseus schema (`@colyseus/schema`, `setState`) is used anywhere in `game-server` — confirmed by a repo-wide search. Everything is plain messages (`protocol.ts`): `state`, `events`, `rejected`, `ended`.
- `publish()` (`backend/game-server/src/battle-room.ts:172-177`) broadcasts an ordered `events` array, then a full `state` snapshot, **for every single accepted action**, bot or human alike:
  ```ts
  private publish(state: MatchState, events: Event[]): void {
    this.match = state;
    this.broadcast(MESSAGE.events, events);
    this.broadcast(MESSAGE.state, this.stateMessage());
    this.finishIfDecided();
  }
  ```
  `handleAction()` (human path, `battle-room.ts:129-147`) and `playBotTurns()` (bot path, below) both call this same method. **The original hypothesis — "the bot's turn arrives as a final snapshot instead of a sequence of events" — is not confirmed.** The wire shape is identical for both; `moved` events already carry the full `path` (ADR 0010).
- `playBotTurns()` (`battle-room.ts:150-170`) is a **tight synchronous loop** with no delay of any kind:
  ```ts
  private playBotTurns(): void {
    for (let iterations = 0; iterations < BOT_ITERATION_GUARD; iterations += 1) {
      if (this.ended) return;
      const current = unitOnTurn(this.match);
      if (!current || current.team !== BOT_TEAM) return;
      const result = applyAction(this.match, chooseBotAction(this.match, BOT_TEAM));
      ...
      this.publish(result.state, result.events);
    }
    ...
  }
  ```
  It keeps calling `publish()` for every action of every consecutive bot unit, with zero pacing. A human's actions are naturally paced by their own click plus one network round trip; the bot's are not paced at all. **Confirmed.**
- The client (`frontend/src/net/session.ts`) listens with plain `room.onMessage` (`onState`, `onEvents`, `onRejected`, `onEnded`), identically for both turns — confirmed no schema callbacks exist client-side either, and no turn-specific listener wiring.
- `MatchScene.handleEvents()` (`MatchScene.ts:1153-1161`) is fully synchronous and has **no queue**:
  ```ts
  private handleEvents(events: Event[]): void {
    for (const event of events) {
      for (const cue of presentationOf(event, this.snapshot, this.state ?? undefined)) this.play(cue);
      this.appendLog(describeEvent(event, UNIT_NAMES, this.battlefield()));
      this.advanceSnapshot(event);
    }
  }
  ```
  `play()` dispatches fire-and-forget to `UnitSprite` (`frontend/src/scenes/units.ts`). `walkTo()` (`units.ts:286-321`) snaps to its first step immediately and tweens the rest; `playAttack()` (`units.ts:327-339`) overwrites a single mutable `this.action` field with no queue of its own — a second call before the first's `recover` window (`ATTACK_TIMELINE.recover = 2000` ms, `view/animation.ts:12`) elapses simply discards the first animation's remaining state. `sync()` (`units.ts:221-245`) only guards the "moving" case (`if (this.moving === null) this.snapTo(placement)`), not the `this.action` field.
- **Confirmed "result before animation" mechanism**: `handleState()` (`MatchScene.ts:980-1012`) calls `this.redraw(message.state)` synchronously on every `state` message, which calls `redrawUnits()` → `sync()` (`units.ts:221-245`), which sets `this.health = { health: unit.health, ... }` and redraws the HP bar **immediately** — independent of the attack cue's own impact timer (`playAttack`'s `this.scene.time.delayedCall(delay, onImpact)`, `units.ts:338`). Since `publish()` sends `events` then `state` back-to-back with no delay, the new HP reaches and is drawn by the client before the attack animation's impact fires.
- No "bot is acting"/"bot skipped" feedback exists anywhere: no camera focus-on-actor, no banner/indicator tied to the bot, confirmed by search across `HudScene.ts`, `banner.ts`, `MatchScene.ts`. `handleState()` only re-selects the active unit for the camera/panel on the human's own turn (`isHumanTurn` check, `MatchScene.ts:996`).

**Cause**

The symptom is confirmed, but the mechanism is different from the prompt's working hypothesis. It is not a snapshot-vs-events transport problem — the protocol already sends ordered, per-action events identically for both sides. The actual, confirmed cause has two parts: (a) the server resolves a bot's entire turn (and any further bot units due right after) in one synchronous burst with no pacing, and (b) the client has no animation queue, so cues and the HP/ammo redraw race each other and overwrite in-flight tweens.

**Solution**

- **Server stays as-is for correctness**: `applyAction`/the engine do not need to change; `publish()`'s event-then-state ordering per action is already the right building block.
- **Client: add a true animation queue.** Buffer each `(events, state)` broadcast as a unit; drain it one action at a time. For the action at the head of the queue: play its cues (`presentationOf`, already defined in `frontend/src/game/presentation.ts`), and only then apply the *visible* part of the matching `state` (HP bars, ammo pips, the log line) — gated on the cue's own already-defined duration (`movementDuration()`/`MOVE_MS_PER_CELL = 120` ms per cell, `ATTACK_TIMELINE.recover = 2000` ms, `RELOAD_TIMELINE.end = 1180` ms, all in `frontend/src/view/animation.ts`). Internal bookkeeping that is never directly visible (e.g. `this.snapshot`, used to resolve the next event's `from`) can keep updating immediately, since nothing user-visible depends on its timing.
- **Add a "bot is acting" cue**: when a queued action belongs to a non-human actor, give it a lightweight visible marker — e.g. a brief camera pan/centre on the acting unit (the centring primitives already exist in `view/camera-math.ts`) — and for a bare `turn-ended` event with nothing else in that action's cue list (a pure skip), show a short toast reusing the existing `Banner`/`bannerFor` pattern (`frontend/src/game/banner.ts`, `frontend/src/scenes/widgets.ts:181-220`) rather than inventing a new overlay.
- **Optional, not required for correctness**: stagger `playBotTurns()`'s broadcasts server-side with small gaps (Colyseus rooms have `this.clock`) when several bot units act consecutively, so the client queue never has to buffer an unbounded backlog in a pathological multi-unit turn. The client queue alone already fixes the symptom even with zero server pacing, because Colyseus delivers messages in order and the queue naturally paces consumption; this is a resilience nice-to-have, not the fix.

**Affected files**

- `backend/game-server/src/battle-room.ts` (optional pacing only).
- `frontend/src/scenes/MatchScene.ts` (`handleEvents`, `handleState` — introduce the queue and defer the visible part of state application).
- `frontend/src/scenes/units.ts` (`sync`, `walkTo`, `playAttack` — need a way to report "this cue is done" back to the queue, e.g. a completion callback, since none exists today).
- `frontend/src/game/presentation.ts` (`Cue` type — likely unchanged, the queue consumes what already exists).
- `frontend/src/game/banner.ts`, `frontend/src/scenes/HudScene.ts` (new "bot acting"/"bot skipped" cue).

**Acceptance criteria**

- During a bot turn with a move and an attack, the bot's sprite walks the path cell by cell (not a snap/teleport), and the attack's damage number/HP change only appears after the attack animation's impact frame, matching the human turn's pacing.
- A bot turn with several consecutive bot units plays each unit's actions in order, with no cue visibly interrupting or overwriting another before it finishes.
- A bot turn that is a pure skip (no legal action) shows a visible cue (e.g. a toast or a camera glance), never silent nothing.
- Reconnecting mid-bot-turn (see § Review, network) still ends up with the correct final state, even if the client never finishes playing an interrupted queue of cues.

**How to test**

- Automated: the queue's draining/ordering logic should be written as a pure state machine (mirroring the style of `autoEndTurn.ts`'s `idle/counting/hinting/sent`), testable in Node without Phaser. Extend `backend/game-server/src/battle-room.test.ts` if server-side pacing is added.
- Manual: play a match against the bot with a multi-unit squad, observe the walk animates step by step, the HP bar updates in sync with the hit, and every bot turn — including a pure skip — shows a visible cue.

### P3 — Input during transitions

**Evidence**

- `canEndTurn` is the only action-bar flag that is unconditionally `true` (`frontend/src/game/actions.ts:126-127`):
  ```ts
  // Ending the turn is always legal; it is how a player with nothing left to do passes.
  canEndTurn: true,
  ```
  every other button (`canMove`, `canAttack`, `canUseAbility`, `canReload`) gates on `canAct = !state.hasActed` and a geometric check.
- `pressAction()` (`MatchScene.ts:884-911`) only short-circuits on `this.finished || this.state === null` (`:885`). Nothing checks the turn banner or any "in transition" flag before sending `endTurn`.
- Board presses are already blocked mid-rotation (`if (this.turn !== null) return;`, `MatchScene.ts:~793-797`, comment citing DT-86) — but the comment explicitly states the HUD, where End Turn lives, is exempt from this lock.
- The turn banner (`frontend/src/game/banner.ts:12-18`, `BANNER_DURATION_MS = 1500`) is drawn by `Banner` (`frontend/src/scenes/widgets.ts:181-220`), a plain `Phaser.GameObjects.Container` with **no `setInteractive()`** — it is purely visual and does not intercept or even know about pointer input. **Confirmed mechanism**: a click during the 1.5 s banner window reaches the action bar exactly as if the banner were not there.
- Delay constants found near turn transitions, none of them currently coupled to input locking: `BANNER_DURATION_MS = 1500` (`banner.ts:18`), `AUTO_END_TURN_MS = 2000` (`frontend/src/game/autoEndTurn.ts:14`), `LONG_PRESS_MS = 400` (`press.ts:13`), `ROTATION_MS = 450` (`rotation-animation.ts:9`). Animation-only timings (`IDLE_STEP_MS`, `WALK_STEP_MS`, `BUTTON_PULSE_MS`, `FONT_WAIT_MS`) are unrelated to turn logic.
- The one reusable "confirm this consequential action" idiom already in the codebase is the move confirm/cancel chip pair (`MoveChip`, `actions.ts:152-175`), drawn only while `state.pendingMove !== null`. There is no generic confirm-dialog widget in `widgets.ts`.
- `autoEndTurn.ts` (`idle → counting → hinting → sent`, `AUTO_END_TURN_MS = 2000`, with `cancel`/`disable`/`rejected` events, `frontend/src/game/autoEndTurn.ts`) is an existing, tested state-machine pattern for "pass the turn after a delay, with a way to cancel" — a good template to follow structurally, even though it solves a different problem (nothing left to do, vs. still having something available).

**Cause**

Confirmed: `canEndTurn` has no gate at all, and the turn banner is purely cosmetic — it was never wired to block input. These are two independent, confirmed gaps, not one bug.

**Solution**

1. Keep `canEndTurn` as a pure rule in `actions.ts` (it genuinely is always legal — the project's own convention, per `ea-4-auto-end-turn.lesson.md`, is "the engine/rule answers the question; the client owns the nudge"). Add a second, presentation-only gate where the button is actually rendered/clicked (`HudScene`'s enabled computation and/or `pressAction`) that ANDs in: the P2 animation queue is empty, **and** the turn banner is no longer visible.
2. Add a confirm step specifically for `endTurn` when `canStillAct(state)` (already imported as `nothingLeft` in `actions.ts`) says something is still available — i.e. skip the confirmation entirely when auto-end-turn would also fire on its own (nothing left anyway), and only ask when the player is about to give something up. Reuse the `MoveChip` visual idiom (an inline confirm/cancel pair) instead of a new modal widget.
3. Revisit `BANNER_DURATION_MS` (1500 ms) now that it will double as part of an input-lock window rather than a purely cosmetic fade: either shorten it, or keep the visual fade at 1500 ms while locking input for a shorter slice of it (e.g. the first 500–700 ms, enough to read "your turn"/"bot's turn" without feeling like a stall).

**Affected files**

- `frontend/src/game/actions.ts` (keep `canEndTurn` pure; new confirm-skip chip model).
- `frontend/src/scenes/MatchScene.ts` (`pressAction`, banner-visibility tracking).
- `frontend/src/scenes/HudScene.ts` (button-enabled computation).
- `frontend/src/game/banner.ts` (expose visibility/remaining duration to gate against).

**Acceptance criteria**

- Clicking End Turn while the turn banner is visible, or while the P2 animation queue is non-empty, does not send `endTurn`.
- Clicking End Turn with a legal move/attack/ability/reload still available asks for confirmation before sending; clicking it with nothing available (mirroring `nothingLeft`) sends immediately, same as today.
- Auto-end-turn's own countdown (`autoEndTurn.ts`) is unaffected: it still fires without asking for confirmation, since it only triggers when `nothingLeft` is true.

**How to test**

- Automated: a pure predicate ("is the action bar allowed to accept input right now") mirroring `autoEndTurn.ts`'s testing style; a test for the confirm-skip chip model mirroring `moveChips`'s existing tests.
- Manual: spam-click End Turn the instant a new turn starts (while the banner is fading); confirm the click is ignored or asks for confirmation instead of silently skipping.

### P4 — Bot is too passive once it finds a good spot

**Evidence**

- `chooseBotAction()` (`backend/game-server/src/bot.ts:117-187`) matches ROADMAP's M2-a heuristic (seek height, retreat when wounded, attack in range) but scoring is "expected damage + kill bonus", not literally "weakest target".
- Weights (`bot.ts:36-43`):
  ```ts
  const SCORE = {
    kill: 100,
    closerMove: 10,
    higherLevel: 5,
    retreat: 20,
    emptyPoolReload: 15,
    endTurn: 0,
  } as const;
  ```
- Candidate order and selection (`bot.ts:126-186`), comment at `:126` confirms intent: *"The candidates are collected in tie-break order: the first one only loses to a strictly higher score."* `endTurn` is pushed **first**, before any move/attack (`:129-130`). Selection:
  ```ts
  let best = candidates[0];
  if (!best) return endTurn;
  for (const candidate of candidates) {
    if (candidate.score > best.score) best = candidate;
  }
  return best.action;
  ```
  Strict `>`. **Confirmed**: any move that computes to exactly `0` (`closerMove`/`retreat`/`higherLevel` all inapplicable — i.e. already at the locally-closest reachable distance, already on the highest reachable level, not wounded) ties with and loses to `endTurn`. If, in addition, no enemy is currently in `attackArea`/no ability validates and no reload is needed, `endTurn` (0, first in the list) wins outright as the only candidate above `0`, or the only one at all.
- This matches the playtest symptom precisely for a bot that has already climbed to a height advantage and is as close as its own scoring rewards, but still outside actual attack range: nothing in the heuristic pulls it the rest of the way in. This causal chain is **reasoned from the confirmed scoring/tie-break code above**, not from a captured runtime trace — flagged as the one inference in this section, everything else is a direct read.
- No stalemate/round-limit/timeout concept exists anywhere: a repo-wide search for `maxRound`, `roundLimit`, `stalemate`, `turnLimit` in `backend/engine/src` and `backend/game-server/src` returns nothing. ROADMAP.md:93 states explicitly: "No turn timer against the bot (the 30 s timer comes with PvP in M5)." `canStillAct` (`backend/engine/src/actions.ts:262-284`) only answers "can the unit on turn still do something this turn" — unrelated to cross-turn stalling.
- The only AI weight table in the codebase is `SCORE` in `bot.ts:36-43`; `backend/game-server/src/config.ts` only reads `PORT`.
- A match currently ends only via `finishIfDecided()` (`battle-room.ts:179-187`), checking team elimination after every published action; no round-count check exists there.

**Cause**

Confirmed: `endTurn`'s fixed `0` score, combined with it being the first-built candidate and the selection's strict `>` comparison, makes it the default whenever every other legal action also scores `0` — which happens whenever the bot cannot get strictly closer, strictly higher, or find a target in range. This is not a "the bot decided to wait" behaviour; it is an emergent fallback of the tie-break rule.

**Solution — evaluating the four options the task asked to weigh**

1. **Round limit with a win criterion.** Needs an explicit tiebreak (HP % and/or units alive, in a stated order) or it recreates the camping incentive at the limit instead of removing it. Affects PvP too (a human can camp exactly the same way) — this is a shared rule, not bot-only, and needs the owner's sign-off since M5's PvP timer (ADR 0004, a *per-turn* 30 s clock) is a different mechanism from a *match-length* cap. Recommended as the floor that guarantees every match terminates, with the exact numbers left to the owner (§ 5).
2. **Growing impatience penalty.** Cheapest fix that targets the confirmed mechanism directly: make `endTurn`'s score negative whenever a living enemy exists (e.g. `-1` instead of `0`), rather than reworking every move's scoring. Every move/attack candidate that currently nets to exactly `0` beats this, while `endTurn` still wins when it is the *only* legal candidate (guaranteed present by the comment at `bot.ts:180`) — i.e. the match still always has a legal action to fall back to. Bot-only; no PvP impact. **Recommended as the primary fix for M4.**
3. **Deliberate imperfection (noise/top-N).** Changes overall bot strength/predictability but does not by itself address the tie-break-favours-`endTurn` mechanism; a flavour addition to layer on later, not a substitute for #2.
4. **Closing perimeter.** Strong thematic fit ("the Agency is sealing the area") but the most expensive: a new engine/map rule touching line of sight, cover and shrinking playable cells over rounds. Recommend deferring past M4 unless the owner wants the thematic payoff now.

**Recommended combination**: #2 (impatience, cheap, bot-only, ships in M4) + #1 (round cap, as the termination guarantee that also covers PvP camping later) with #3 and #4 deferred. If the owner judges #2 alone is enough to close the M4 playtest symptom (no PvP exists yet to camp against), the round cap can be deferred to M5's PvP timer design instead of being built twice.

**Affected files**

- `backend/game-server/src/bot.ts` (`SCORE.endTurn`, or a small conditional around it).
- If the round cap ships in M4: `backend/game-server/src/battle-room.ts` (`finishIfDecided`), extracted as a small pure helper (e.g. `matchOutcome(state, maxRounds)`) rather than inlined, so a future PvP room (M5) reuses it instead of duplicating the check.

**Acceptance criteria**

- A bot that has reached a height/distance-optimal position but has no target in range no longer repeatedly ends its turn when it has any legal move left that is not strictly worse than standing still.
- The bot does not become suicidal: it still retreats when wounded (`retreat` bonus unchanged) and still prefers a kill over chip damage (`kill` bonus unchanged) — verified by the existing `bot.test.ts` scenarios plus new ones for the previously-camping case.
- If a round cap ships: the match always ends by the cap, with a tiebreak that is shown in the UI (so neither side is surprised), and the same check applies regardless of which side is "ahead" positionally.

**How to test**

- Automated: extend `backend/game-server/src/bot.test.ts` with the exact camping scenario found above (bot at locally-optimal position, no target in range, not wounded) and assert it now picks a move, not `endTurn`. Extend `battle-room.test.ts` if the round cap ships.
- Manual: replay a playtest scenario where the bot was observed camping; confirm it now advances.

## 3. Implementation order and dependencies

1. **P1** — fully independent (input/view layer only), smallest, and the user's own "critical" label. Land first.
2. **P4, impatience penalty only** — fully independent, one-file, bot-only. Can land in parallel with P1.
3. **P2** — foundation for P3 (the input lock needs to know when the queue is empty). Land before P3.
4. **P3** — depends on P2's queue existing, per the task's own note ("P3 depende do P2").
5. **P4, round cap** — only after the owner decides the numbers and the M4-vs-M5 split (§ 5); not blocking anything else.

Each item stays its own diff per `CLAUDE.md` rule 5 (one subject per diff), even where two land close together (e.g. P1 and the P4 impatience fix touch unrelated files and can be reviewed independently).

## 4. Points of contact with onboarding

The M3.5 onboarding (`.ia_context/plans/onboarding.index.md`, `onboarding-m2-integration.plan.md`) is a **DOM overlay on the title screen**, independent of `title.ts`'s connect flow, built and reviewed separately from this plan. Checked directly against this plan's scope:

- **No code overlap.** Onboarding's own "files changed" list (`frontend/index.html`, `frontend/src/onboarding/*`, `frontend/src/title/title.ts`) never touches `MatchScene.ts`, `HudScene.ts`, `bot.ts`, `battle-room.ts`, `autoEndTurn.ts` or `banner.ts` — the files this plan's four problems live in. The onboarding overlay runs (or is skipped) before the Phaser canvas/`MatchScene` is even created for a first-time visit.
- **Explicitly out of scope on the onboarding side already**: `onboarding.index.md` § "Fora de escopo" names exactly the three things the task asked to flag — "input lock", "event queue", "contextual tutorial" — as a guided/interactive tutorial over the real board, and states it is deferred to a future iteration if feedback still asks for it after this ships. This plan does not reopen that decision.
- **Content opportunity, not a dependency**: once P2's "bot is acting"/"bot skipped" feedback and P3's input lock/confirm-skip exist, the onboarding's static "how to play" cards (ROADMAP § M3.5: move/attack, resources, cover/facing/height, hit-chance badge) could eventually mention "wait for the bot's turn to finish" — but per onboarding's own D2 ("static explanatory screens, no action in the match is ever locked by the tutorial") this is future card-copy work for whoever authors M3.5's content, not something this M4 fix should add now.
- **One thing worth re-checking, not because code is shared**: both this plan's P1 (new `Escape` keyboard handler in `MatchScene`) and the onboarding overlay (its own Tab-focus trap over the title's `#cta`) now add keyboard handling independently. They live in different scenes/DOM layers and should not interact, but it is cheap to re-verify after both ship that pressing `Escape` on the title screen with the onboarding overlay open does not reach `MatchScene` (it can't — `MatchScene` does not exist yet at that point) and vice versa.

## 5. Open questions (owner decisions)

- **P1**: ship `Escape` only for the cancel/escape hatch, leaving right-click as "inspect" (this plan's recommendation) — or repurpose right-click, which conflicts with the already-shipped inspect gesture and would need a new way to disambiguate (e.g. long-press)?
- **P1**: is the reported "confirm button disabled" literally about the hit-chance badge (confirmed gap), the move-confirm chips or the action bar (both ruled out), or something the reporting playtester experienced that isn't reproduced by reading the code? Worth getting a screen recording or the exact input sequence before considering this problem fully closed.
- **P2**: how aggressive should the "bot is acting" camera cue be — always pan/centre on the acting unit, or only when it's off-screen? A feel decision, not a technical one.
- **P2**: should an animation-speed/skip setting ship with this fix (symmetrical with the existing auto-end-turn setting), or wait and see if experienced players complain in testing first (see § 6)?
- **P3**: exact wording and trigger for "confirm skip turn" — this plan recommends asking only when `canStillAct` is true; confirm that's the intended scope.
- **P3**: keep `BANNER_DURATION_MS` at 1500 ms (with a shorter input lock inside it), or shorten the banner itself now that it has a functional role beyond cosmetics?
- **P4**: exact round cap and tiebreak (HP % vs. units alive vs. both, and in what order) — a game-design/balance call.
- **P4**: does the round cap need to ship in M4 at all (no PvP exists yet, so no human-vs-human camping risk yet), or is the impatience-penalty fix sufficient for M4 with the round cap deferred to M5's PvP timer design (ADR 0004)?

## 6. Review of this plan

Reviewed from each angle below; changes made as a result, and risks accepted as-is, are listed under each.

**New player (no tutorial seen).** After P2+P3, does someone who has never played understand what happens during the bot's turn? The "bot is acting"/"bot skipped" cue (P2) and the input lock (P3) are both meant for exactly this reader — but a lock with no visible reason is its own confusion. *Change made*: P3's acceptance criteria require the lock to be visible (banner still on screen, queue still animating) rather than a silent, invisible rejection — a new player should always see *something* happening while input is withheld, never a dead click with no feedback. *Risk accepted*: this plan does not add a new explanatory string for "why can't I act right now" beyond the existing banner/animation — if testing shows that's not enough, it is a small follow-up, not a reason to hold this plan.

**Experienced, impatient player.** Does the animation queue (P2) or the confirm-skip step (P3) make the game feel slow? *Change made*: P3's confirm-skip explicitly does **not** fire when `nothingLeft` is true (mirroring auto-end-turn), so the common "I have nothing left, let me pass" case stays a single click, exactly as today. The round-cap-per-cell durations proposed for the queue (120 ms/cell, up to 2000 ms recover) are the project's own existing animation timings — the queue adds *pacing*, not new durations. *Open question raised in § 5*: whether an animation-speed/skip setting should ship now or after feedback; this plan does not force the decision.

**Authoritative server and network.**
- *Disconnect mid-queue*: the client's animation queue is purely a presentation buffer over already-applied server state; a disconnect mid-queue loses only unseen cues, never game state — `onReconnect()` (`battle-room.ts:119-121`) already resends the full `state`, which the reconnect path treats as authoritative (confirmed by existing reconnection behaviour, unchanged by this plan).
- *Out-of-order events*: Colyseus delivers `room.onMessage` callbacks in send order over one connection, so the existing assumption (events before the state that resulted from them) holds; this plan does not add anything that depends on an ordering guarantee stronger than what's already relied on today.
- *Reconnecting mid-bot-turn*: the resent `state` reflects wherever `playBotTurns()` had gotten to when the client dropped — correct today and unaffected by adding a client-only animation queue, since the queue only decides how fast to *draw* what the server already decided.
- *Divergence risk*: the queue must only delay the *visible* effects (HP bars, log lines, cues), never the authoritative data (`this.state`, used by `handleState` for `selectedId`/`mode`/available actions) — § "Solution" for P2 says this explicitly ("internal bookkeeping... can keep updating immediately"); flagged here as the one implementation detail that would reintroduce a real bug (acting on stale available-actions data) if gotten wrong.

**Multiplayer and concurrency.** The task's memory notes a past issue with two bot rooms sharing state. Checked directly: `BattleRoom`'s `match`, `humanSessionId`, `winner`, `ended` are all **instance fields** (`battle-room.ts:90-96`), and Colyseus instantiates one `BattleRoom` object per room — confirmed no static/module-level mutable state in `battle-room.ts` or `bot.ts` (`SCORE` is a frozen, read-only `const`). None of P1-P4's proposed changes introduce new shared or global state: the P2 animation queue is a per-`MatchScene` client-side field, the P3 gating is per-scene, the P4 scoring change is a constant tweak. *No change made* — this review confirms the existing isolation holds and nothing proposed here weakens it.

**Game design.**
- Round-cap fairness/legibility (P4): addressed as an open question (§ 5) — this plan does not pick numbers, only requires the cap and its tiebreak be shown in the UI once decided.
- Suicidal bot risk (P4): addressed in P4's acceptance criteria — the `retreat` and `kill` bonuses are untouched, only `endTurn`'s own score moves from `0` to negative, so a wounded bot still retreats before anything else changes its mind.
- Class balance (Sniper holding position): the impatience fix only penalizes `endTurn` when it currently *ties* with a `0`-scoring move — it does not touch `closerMove`/`higherLevel`/`retreat`, so a Sniper that is already optimally positioned and *has* a target in range is unaffected (that candidate already scores well above `0` via `hitChance * damage`). Only a Sniper with no target in range and nothing closer/higher available would now take a small step instead of waiting — which is the behaviour the playtest is asking for, not a nerf to its hold-position identity. *Risk accepted*: this reasoning is not yet validated against an actual Sniper-vs-camping playtest; flagged in P4's "how to test".

**Regression.** Re-test after these changes, specifically:
- Auto end turn (`autoEndTurn.ts`) and its setting toggle — P3 must not change its own trigger condition (`nothingLeft`), only add a separate, manual-click confirmation path.
- Multi-cell movement preview and the move confirm/cancel chips — P1 touches `updatePreview`/`previewCell`; the move-chip path (`pendingMove`) is a different mechanism (confirmed in P1's evidence) but worth re-running the existing manual move-preview checks after the P1 diff lands.
- Area abilities and their preview (`abilityChances`, `targetPreviewChances`) — P1's fix re-triggers the same function `updatePreview()` already calls for ability mode; re-test ability aiming specifically, not just attack.
- The hit-chance badge (EA-18/EA-5) — directly touched by P1; re-run its existing manual checks.
- Rotation with sprites facing the camera (EA-12/EA-8) — not touched by this plan's P1 fix (it only re-triggers the preview, not the rotation/billboard math itself), but it is the nearest adjacent system and worth a quick look after the diff lands given how much P1's investigation walked through `rotateView`/`settleTurn`.
- Reaction-ability UI (`game/ability-menu.ts`, `game/panel.ts`, `game/inspect-window.ts`, `HudScene.ts` all reference "reaction") — not investigated in depth for this plan; P2's animation queue changes how/when cues play, and if a reaction window is presentation-visible today, it should be re-tested against the new queue even though this plan found no evidence it is affected. Listed as a regression check, not a confirmed risk.

**Scope and cost.** P2 (the animation queue) is the one item in this plan large enough to be split further if needed: the minimal slice that fixes the playtest symptom is "gate the HP/log visual update on the cue's own duration finishing" (no new feature, just correct sequencing); the "bot is acting" camera cue and the optional server-side pacing are improvements on top, not required for the core fix, and can be cut to a follow-up if M4's time budget is tight. P4's round cap is explicitly flagged (§ 5) as possibly deferrable to M5 rather than built now. P1 and P4's impatience fix are both small enough that splitting them further would not help.

**Devil's advocate, one sentence per main solution.**
- *P1 (re-run preview + Escape-only cancel)*: the strongest argument against is that Escape-only doesn't match what the task asked for ("Esc ou clique direito") and a player on a touch device has neither — kept anyway, because right-click is already a shipped, different feature and a touch-specific cancel (e.g. a visible "cancel aim" chip) is a cheap addition the owner can request separately if touch testing shows it's needed.
- *P2 (client-only animation queue, no server pacing)*: the strongest argument against is that a client-only fix leaves the server free to flood the client with an unbounded burst in a pathological multi-unit bot turn, which the queue would then have to buffer entirely in memory before it can even start draining — kept as the primary fix anyway because it is simpler and sufficient for the roster sizes this game ships with (three units per side), with server-side pacing listed as the cheap mitigation if that assumption ever breaks.
- *P3 (confirm-skip only when something is still available)*: the strongest argument against is that a player who genuinely wants to pass with options still open (a valid tactical choice) now has to click twice — kept anyway because the playtest symptom is specifically *accidental* skips, and a deliberate pass is one extra click, not a blocked action.
- *P4 (negative `endTurn` score instead of reworking move scoring)*: the strongest argument against is that it is a narrow patch over a tie-break artefact rather than a redesign of the heuristic (e.g. a proper "distance to nearest reachable attack position" score) — kept anyway because it directly and minimally fixes the confirmed mechanism without touching the move/attack scoring that is already working correctly in every other observed case, and a full heuristic redesign is a much larger, separate piece of work this plan does not scope.

No temporary scripts or logs were created to investigate this plan; all findings came from reading the existing source and test files.
