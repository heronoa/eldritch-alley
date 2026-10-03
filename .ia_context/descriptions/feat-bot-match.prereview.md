# Pre-review — M2-a: a playable match against the bot

**Branch:** `feat/bot-match`
**Generated on:** 2026-10-03

---

### 1. What to test

Automated first — these are the proxy for everything that has no browser:

- **The three suites, from a clean install:** `npm ci`, then `npm test`. Expect **122 engine, 11
  server and 101 frontend** tests, 0 failures. Then `npm run build` and `npm run typecheck`.
- **Type-check the frontend separately:** the root `typecheck` script covers only the three backend
  workspaces. `npm run build -w @eldritch-alley/frontend` is what runs `tsc --noEmit` over the client.
- **The engine must be rebuilt before the server tests:** `npm run build -w @eldritch-alley/engine`
  first, or the game-server tests read a stale `dist/` and fail with `unit.maxHealth` undefined. If
  they fail that way, this is why — not a real defect.
- **The full match across the wire:** `npm test -w @eldritch-alley/game-server`, and read
  `integration.test.ts`. It plays a scripted match to `ended` and replays every received event onto a
  copy of the setup, comparing against the last `state` message. That comparison is the strongest
  guarantee in this MR.
- **`npm audit`:** must show **0 high and 0 critical** (18 low and moderate is the expected remainder,
  DT-19). A high advisory on a path starting at `@colyseus/*` means the 0.18 migration regressed.

Manual, in the browser — highest risk first:

- **DT-30, the button clicks (blocking):** start both dev servers, open `localhost:5173`, click
  "Jogar contra o bot". On the human's turn, click each of the four buttons **in the middle of where it
  is drawn**. Today the owner reports that a click there does nothing and only a click further left
  and further up responds. Confirm whether it still happens and how far off the hit area is. This is
  the known defect in §1 of the description; it should be fixed before the merge.
- **Reconnection, inside the window:** during a match, stop the game server. The client must show
  "Reconectando...". Start it again within 120 seconds: the client must return to the same state with
  the HUD intact. Then repeat and wait past 120 seconds: the client must show "Partida perdida" and
  stop accepting clicks.
- **Reconnection after a reload:** with a match in progress, refresh the page. The client must pick the
  token out of `sessionStorage` and resume. Then repeat with `sessionStorage` unavailable (a private
  window): the match must still play, only without the ability to resume after a reload.
- **Protocol version mismatch:** with a v2 client, send a `state` message with `version: 1` (or stub
  `PROTOCOL_VERSION` on one side). The client must show "Versão incompatível" and must not draw a unit
  with a missing health ceiling.
- **The empty magazine:** fire the Sniper three times until `Munição` reads `0/3`. The next attack on an
  adjacent enemy must be a melee blow for half damage, and an attack at distance 2 must be refused with
  a Portuguese sentence. `Recarregar` must then be enabled, and `Mover` must stay enabled while
  `Atacar` and `Recarregar` go disabled after the action is spent.
- **A class with no magazine:** select the Wizard or the Priest. `Munição` must read `—` and
  `Recarregar` must be disabled — never a reload offered for a unit that has no magazine.
- **A refusal leaves nothing behind:** click an enemy out of range with `Atacar` armed. The log must
  show a Portuguese sentence, the mode must stay armed and the selection must stay put — no raw enum
  such as `not-enough-movement`, and no change to the board.
- **The end of a match:** play until one side is eliminated. The screen must show "Vitória" or
  "Derrota", the four buttons must all be disabled, and further clicks on the board must do nothing.
- **The corpse:** kill one of the bot's units. Its tile must keep a greyed body with a **readable**
  letter (this is the contrast fix — a dark letter on the grey body is the bug), and a slot must
  disappear from the carousel. The tile must refuse a move onto it while the body holds it.
- **The contrast, on every fill:** look at your own pieces, the bot's pieces and a corpse. All three
  letters must be legible. On team A the old white letter measured 1.14:1 and was invisible.
- **The resize:** open the browser at a height below 720 px (or zoom in). The whole canvas must scale
  down and stay fully visible — no cropping. `frontend/index.html` carries the CSS that makes this work.
- **The placeholders:** `Reação` and `Mana` must be visible and dimmed, and must not react to the
  pointer at all.
- **The turn order:** the carousel must list six slots with the acting unit first and marked, advance
  as turns pass, and shrink when a unit dies.

---

### 2. Code checklist

- [ ] No `/` in `backend/engine/src` outside comments and strings — `forbidden.test.ts` still passes
- [ ] No `Math.random`, `Date`, `process`, `require` or `node:` in `backend/engine/src`
- [ ] `frontend/src/game/selection.ts` has **no diff in this MR** (`git log develop..HEAD -- frontend/src/game/selection.ts` shows only its creation commit)
- [ ] `applyMode` only ever removes an intent — it never constructs one
- [ ] `PROTOCOL_VERSION` is 2 on both sides, and `frontend/src/protocol.ts` keeps its "keep in sync" header
- [ ] `MAX_HEALTH_BY_UNIT_ID` is gone from `backend/game-server/src/map.ts` and nothing imports it
- [ ] The room never takes the actor from the client — it derives it, and refuses with `not-your-turn` otherwise
- [ ] The bot scores only actions `applyAction` accepted, and never reads the rng or the events
- [ ] The `BOT_ITERATION_GUARD` path ends the match rather than looping
- [ ] `teamHasLivingUnit` is the single definition of "still in the fight" on the server
- [ ] Every `RejectReason` in `frontend/src/protocol.ts` has a sentence in `describeRejection` (12 of them)
- [ ] No coordinate, colour, label or enabled flag is decided inside a scene method — they come from `view/layout.ts`, `view/theme.ts` or `game/`
- [ ] No `console.*` left in `frontend/src`; on the server only the two deliberate `console.error` calls (a refused bot action, the iteration guard) and the startup banner in `main.ts`
- [ ] `.ia_context/` contains only English content

---

### 3. Behaviour checklist

- [ ] A complete match can be played in the browser against the bot, from "Jogar contra o bot" to
      "Vitória" / "Derrota", without a reload
- [ ] The four actions are all reachable by the human: move, attack, reload and end turn
- [ ] `Mover` and `Atacar` arm a mode and survive repeated clicks; the mode clears when the action is
      spent, and pressing the armed button again cancels it
- [ ] The acting unit is selected automatically when the turn arrives
- [ ] The highlight agrees with the click: every highlighted cell produces an action when clicked, and
      a refused click is explained in the log
- [ ] The panel shows `health/maxHealth`, `—` for movement on a unit that is not the actor, and `—` for
      a class with no magazine
- [ ] A rejected action changes nothing: no state change, no event, no cleared selection
- [ ] A forced disconnect inside 120 s is recovered; past it, the match is lost and clicks stop
- [ ] A page reload during a match resumes it through the stored token
- [ ] A second client is refused with `room full`
- [ ] The canvas fits a viewport shorter than 720 px without cropping
- [ ] ADR 0008 is linked from the ADR index and its status matches its text
