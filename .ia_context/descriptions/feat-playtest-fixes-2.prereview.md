# Pre-review — M4 playtest fixes: camera escape, bot pacing, turn-lock confirmation, bot engagement, and two stability fixes found in manual testing

**Branch:** `feat/playtest-fixes-2`
**Generated on:** 2026-10-14

---

### 1. What to test

Run `npm run dev:game-server` and `npm run dev:frontend` from the root and play against the bot, unless a step says otherwise. If port `2567` is already in use, something from an earlier session is still running — find it (`lsof -i :2567`) and stop it before starting a fresh one; a second game-server process behind the first one is a common false "nothing works" report. If anything looks broken and the browser console shows `X is not a function` from an engine import, that is very likely DT-90 (a stale Vite dev-cache), not a real regression: `rm -rf frontend/node_modules/.vite` and restart the frontend dev server before concluding otherwise. Organised from most critical to least.

**1. The two stability fixes — play a full turn that moves, then casts the area ability, and watch for a stuck panel.** Pick the Wizard, move it, then cast its ability so the aim lands between two units (one hit, ideally, not a miss). Expected: the fireball's blast lands, a damage or miss result appears once the blast's own visual completes (not instantly), and once your turn's own wait is over the action bar — End Turn included — re-enables itself **on its own**, with no need to touch the camera or zoom. If the bar stays disabled, open the browser console before concluding it's stuck: a red `TypeError` there (anything "`... is not a function`") means DT-90 fired and the panel should have recovered anyway — if it recovered, that's this MR's fix working as intended even while DT-90 itself is still open; if the bar never comes back no matter what, that is this MR failing to do its one job. Repeat the same move-then-cast sequence two or three times across a match — the bug this guards against showed up on exactly this sequence, not on a single ability cast in isolation.

**2. The action bar locks during a transition, and never needs an unrelated interaction to re-enable.** Let a multi-unit bot turn play out fully (several bot actions in a row, ideally including at least one bot that just passes). Expected: the action bar — all five buttons — stays visibly disabled for the whole bot turn, each bot action's animation plays in full before the next one starts (no teleporting, no overlapping swings), and a bot that does nothing still holds the "enemy turn" banner on screen for a beat instead of flashing by unreadably. The instant it becomes your turn, the bar enables itself with no further input — do not touch the camera to "help" it along; that is exactly the bug being checked for.

**3. End Turn asks once before giving up an open turn, and never when there's nothing left.** With movement or an action still available, press End Turn: the button relabels to "Confirma?" / "Sure?" instead of sending anything. Press it again: the turn actually ends. Press End Turn once, then press any other button (Move, Attack, a reload, even just arming and disarming a mode): the question is dropped silently, and End Turn reverts to its normal label — pressing it again starts the question over, it does not end the turn from the stale first press. Now spend the unit's whole turn (nothing left to do): press End Turn once — it ends immediately, no question asked, same as before this change. Also confirm the existing auto-end-turn countdown (nothing left, after ~2 s) still fires on its own with no question either.

**4. The hover preview survives a camera rotation, and Escape is a universal "put it down".** Arm Attack or an ability, hover a legal enemy until the hit-chance badge shows, then rotate the camera (the panel's ⟲/⟳ or `Q`/`E`) **without moving the mouse afterward**. Expected: the badge is back the instant the rotation settles, not only once you jiggle the mouse. Then, at various points — mode armed with nothing hovered, mid-aim with the badge showing, with the ability menu open — press `Escape`. Expected every time: whatever was armed falls back to `Inspecionar`/inspect, the ability menu closes if it was open, and the action bar reflects it immediately. Confirm right-click still opens unit inspection as before — it was never touched and should not now mean "cancel".

**5. The bot keeps closing in instead of camping.** Play several matches (or let the bot play itself out across a few rounds) and watch for a bot unit that has clearly reached a good spot — height advantage, no legal attack yet — repeatedly ending its turn instead of advancing. It should now take the best available move each time something is still legal, and only truly pass once nothing at all is legal. This is a statistical improvement, not a guaranteed single-match observation; if a bot still camps, check first whether every neighbouring cell is genuinely occupied or out of bounds (a real "nothing legal" case) before calling it a regression.

**6. Regression pass — things this diff could plausibly have broken without meaning to.** Auto-passage of turn (already covered in #3) · a multi-cell move preview and its confirm/cancel chips, with the chips' own screen position unaffected by rotation · an area ability's preview badges over every unit it would hit, allies and the caster included · the hit-chance badge in general (EA-18) · rotation with sprites correctly facing the camera on all four sides (EA-12) · a basic (non-area) attack's hit/miss result still timed to its own swing, not just the area-ability case tested in #1.

---

### 2. Code checklist

- [ ] `playStep` in `MatchScene.ts` always reaches its `this.time.delayedCall(...)` line, even when `applyStep` throws — re-read it; this is the one line standing between any future exception and a permanently stuck match.
- [ ] `targetPreviewChances` never calls `computeTargetPreview` outside its own `try`, and the `catch` returns an empty `Map` rather than re-throwing or returning `undefined`.
- [ ] `game/animationQueue.ts` and `game/cueTiming.ts` import nothing from Phaser; `view/healthHold.ts` imports nothing from Phaser or from `scenes/`.
- [ ] `UnitSprite.playAttack`'s returned delay and the delay `expectImpact` is given are the same number, computed once — not two separate calls to `impactDelay` that could drift apart.
- [ ] `enqueueStep`/`playStep`/`advanceQueue` touch `this.state`/`this.snapshot` only inside `applyStep`, never directly — the ordering guarantee (cues read against the board *before* the action) depends on nothing else writing those fields.
- [ ] The banner-based lock (`inputLockedUntil`) is skipped when `this.lastActiveSlot` is `null` (the match's own opening state) — confirm this guard is still there; without it, the very first turn of a match locks the bar with no real hand-over to justify it.
- [ ] `SCORE.endTurnWhileEngaged` is only used when `nearestEnemyDistance` is finite; `SCORE.endTurn` (0) still applies once every enemy is gone, so `chooseBotAction` always has a legal fallback.
- [ ] No `any` added without a justification, and no `console.log` left in the diff — `console.error` in `playStep`'s catch and in `targetPreviewChances`'s catch is intentional and should stay.
- [ ] Both catalogs carry `action.confirmEndTurn`; `catalog.en-US.ts` is complete by type, so a missing key would not compile.
- [ ] Nothing in the diff touches `backend/engine/src` — this is a client-and-bot-only set of fixes; any engine change here is out of scope and worth asking about.
- [ ] `npm test -w @eldritch-alley/engine` 342/342, `npm test -w @eldritch-alley/game-server` 82/82, `npm test -w @eldritch-alley/frontend` 820/820.
- [ ] `npm run typecheck`, `npx tsc -p frontend/tsconfig.json --noEmit` and `npm run build -w @eldritch-alley/frontend` all pass.
- [ ] Nothing in the diff is outside `docs/plans/m4-correcoes-playtest.md`'s scope other than the two stability fixes, which the description names explicitly as unplanned.

---

### 3. Behaviour checklist

- [ ] A move-then-cast-ability sequence never leaves the action bar permanently disabled, across repeated attempts.
- [ ] The action bar — every button — is visibly disabled for the whole length of a bot's turn and re-enables itself with no camera or zoom interaction needed.
- [ ] A bot action's animation always finishes before the next bot action's animation starts; nothing teleports or overlaps.
- [ ] A bot turn that is a pure skip holds its banner on screen long enough to read, rather than flashing by.
- [ ] End Turn with something left asks once (relabels, does not send) and sends only on the second press; End Turn with nothing left still sends on the first press.
- [ ] Any press other than a second End Turn drops a pending End Turn question without ending the turn.
- [ ] The hit-chance badge reappears on its own the instant a camera rotation settles, with no mouse movement needed.
- [ ] `Escape` puts down an armed mode, an armed ability, and an open ability menu, from any combination of them.
- [ ] Right-click still opens unit inspection; it was not repurposed into a cancel gesture.
- [ ] A bot that reaches a good position keeps advancing instead of defaulting to End Turn, whenever any legal move is better than standing still.
- [ ] Multi-cell move preview, its confirm/cancel chips, area-ability preview badges, the hit-chance badge, rotation-aware sprite facing, and a basic attack's own hit/miss timing all still behave exactly as before this branch.
