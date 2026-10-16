# Pre-review — The tile under the mouse, and badges that name what they answer (M5 playtest polish)

**Branch:** `feat/chances-visuals`
**Generated on:** 2026-10-16

---

### 1. What to test

Run `npm run dev:game-server` and `npm run dev:frontend` from the root and play against the bot, with a **mouse** (not a trackpad-and-touch mix, and not the devtools' touch emulation except where a step asks for it) — the whole first subject of this branch exists only where a pointer reports a hover with no button down. If port `2567` is in use, something from an earlier session is still running. DT-90 (a stale Vite pre-bundle cache) is *not* expected here, because nothing in this diff adds an export to a workspace package; if the console shows `... is not a function` from an engine import anyway, that is DT-90 and the fix is `rm -rf frontend/node_modules/.vite` and a dev-server restart, not a change to this branch. Organised from most critical to least.

**1. The mark lands on the tile a click would act on — the whole contract, in one pass.** Arm nothing (stay in `Inspecionar`) and move the mouse across the board, slowly, over empty tiles, over a crate, over a gap between two platforms, and off the board's edge. Expected: a thin paper-white **outline** (no fill) traces the top face of the tile under the pointer, one tile at a time; it disappears the instant the pointer leaves the board; and it never paints a tile that has no floor. Then, with the same tile outline showing, click it — what the click acts on must be the tile the outline is on. This is the one scenario that catches a world/screen mix-up: if the outline lags behind the pointer or tracks a tile one row off while the camera is panned or zoomed, stop and read `cellUnderPointer` before testing anything else.

**2. Over a unit's figure, the mark goes on the unit's own tile.** Hover the *body* of a unit, not its feet — the upper half of the sprite, which covers the tiles behind it. Expected: the outline is on the tile the unit stands on (the tile a click on that figure would act on, EA-8), not on the tile the sprite's head happens to be drawn over. Do it for a unit on a raised tile too, where the figure overlaps the cells behind it the most.

**3. Over a turn-queue portrait, the mark appears on the board without the mouse ever touching it.** Move the pointer straight to the initiative chips along the top and rest it on each portrait in turn. Expected: the outline appears on that unit's tile, nowhere near the pointer — pan the map so that tile sits at the far edge of the view, or off it, and the mark follows the tile rather than the pointer. Moving from one portrait to the next moves the mark; the gaps between the chips mark nothing; moving off the strip onto empty HUD clears it. Then confirm the click still does what it did before — a portrait press still selects/inspects that unit, and the outline is not eating the press.

**4. The HUD has the point, not the board behind it.** Pan and zoom so that a board tile sits *behind* each of these, then hover the panel: the legend band, the log (closed and open), the settings gear and its open panel, the unit-inspection window, the ability menu while it is up, the camera panel, the action bar, and the two confirm/cancel chips of a multi-cell move. Expected in every case: **no outline at all**, however clearly a tile is behind the panel. The gaps *inside* those panels (between the gear's rows, the log's empty band, the panel's title) count as the panel's too. This is the scenario most likely to find a drift between `hudCoversPoint` and `hudTakesPress` — if a panel is missing from one of them, the outline appears under a point that also swallows the click, or the reverse.

**5. The mark and the aim's own marks are read together, neither suppressing the other.** Arm `Atacar` and hover a legal enemy: the hit-chance badge shows **and** the outline is on that enemy's tile at the same time, with the outline drawn over the wash and under the unit. Arm `Mover` and hover one of the highlighted cells: the move wash is still visible *through* and around the outline — the outline is a stroke precisely so it does not hide the fill. Unarm, and confirm the odds badge goes away while the outline stays. Then hover an illegal target, an ally, and a cell out of range while `Atacar` is armed: the outline follows the mouse onto whatever tile it is on, and the badge simply does not appear — the mark is a question about the mouse, not about legality.

**6. A finger never leaves a mark.** In the devtools' device emulation (touch on), tap a tile, long-press a tile, long-press a unit, and drag the map. Expected: no outline is ever left behind, before, during or after any of them — and the long press still does what it did (inspection on an empty tile, the aim preview while `Atacar`/`Habilidade` is armed). Then turn emulation off and hover the same tiles with the mouse: the outline is there, which is the difference being checked.

**7. The mark survives the camera, and outlives nothing it shouldn't.** Rest the mouse on a tile and then rotate the camera (⟲/⟳ or `Q`/`E`), pan, and zoom without moving the pointer. Expected: the outline stays on that same tile through all three, and never sits on the same screen pixels with a different tile under it. Then play out a full bot turn with the mouse resting somewhere on the board: the outline keeps tracking the mouse underneath the bot's animations (this is deliberate, D3). Then lose or win the match: on the result screen, and with the battle report open over it, hovering the board leaves **nothing** outlined (D5). Then start a new match: nothing from the previous one is left on screen.

**8. The badges say what they answer, in both languages.** Aim a basic attack at an enemy and read the badge: `Acerto NN%` in pt-BR, `Hit NN%` in en-US — never a bare number. Stand a unit next to one cover prop, then next to two: `Cobertura: leste` / `Cover: East`, then the two-sided sentence with ` e ` / ` and `. Then make both badges show at once (a unit in cover being aimed at): both are legible, the cover one above the odds one, neither tag overlapping the other and neither tag covering its own words. Switch the language with the switcher mid-match: both badges are rewritten without a reload.

**9. The tag does the one thing it was added for — the words read against a controlled backing.** Aim at a unit standing on the lightest tile the maps draw (bright concrete, the pale rooftop) and at one on the darkest, and read the badge both times; do the same with a cover badge over a unit on a bright tile, over a unit on a dark one, and over a unit with the night sky behind it. Expected: in all six, the words sit on the same carbon panel and read at the same contrast. Also check the widest case the catalog can produce — a unit with two long side names (`Cobertura: noroeste e sudeste` / `Cover: Northwest and Southeast`) — and confirm the tag grew with the words rather than clipping them, and that the badge above it did not move.

**10. Regression pass on everything the hover sits next to.** The move highlight and its chips (including a multi-cell move) · the selected-unit ring and the facing arrow · the health and mana bars · the turn arrow the two badges now float above — confirm a tag never covers the arrow or the bars, and that a unit without cover and without an aim still shows none of it · the odds badge appearing/disappearing on hover and on mode change · right-click inspection, which must not have become "clear the hover" · the action bar's five buttons, whose click zones are read before the board · the carousel's portrait presses · the camera panel's controls · the settings panel's rows · the whole board during a replay, including while the replay's camera turns.

---

### 2. Code checklist

- [ ] `hudCoversPoint` reads the **same pieces in the same order** as `hudTakesPress`: ability menu → inspection window → countdown (link and line) → settings gear → settings panel → log → action-bar buttons → camera panel → move chips → `hudRects()`. They share no code on purpose (plan D4), so any edit to one must be mirrored in the other by hand.
- [ ] `hudCoversPoint` has **no side effect** of its own — no `pressAbilityMenu`, no `session.send`, no toggle, no `pushHud`. It answers a question and nothing else.
- [ ] `LAYER.hover` stays strictly between `LAYER.highlight` and `depthOfUnit`, and no other file computes a depth for this mark; `depth.test.ts` pins it across a whole board.
- [ ] `drawHoverHighlight` strokes and **never fills**, and returns before drawing when the cell is `null`, when the state is `null`, and when the level is `NO_FLOOR`.
- [ ] `setHoveredCell` keeps its no-op guard through the shared `sameCell`, and the extraction of `sameCell`/`cellUnderPointer` left `updatePreview`'s behaviour identical (a null on either side is equal only to a null on the other).
- [ ] `init()` clears **both** `hoveredCell` and `hoverHighlight` (the `Graphics` belonged to the display list of the scene that is gone), and `finish()` clears `hoveredCell` before the HUD is pushed.
- [ ] The tags are inserted into the sprite's container **before** their text, and `setCoverBadge`/`setHitChanceBadge` show and hide tag and text together — no path sets one without the other.
- [ ] `fitTag` is the only place that sizes a tag, and both badges go through it; no width is hard-coded.
- [ ] Both catalogs carry the same placeholders (`{value}`, `{sides}`) and no key was added or removed — `git diff develop...feat/chances-visuals -- frontend/src/i18n/` should show two changed values and comments only.
- [ ] Nothing in the diff touches `backend/` — `git diff --stat develop...feat/chances-visuals -- backend/` is empty; no engine export, no protocol field, no new ADR.
- [ ] No `any` added outside the test file's documented `Proxy` casts, no `console.log`, no debug draw left in.
- [ ] `README.md`'s `TAG` (1.2.0 → 1.7.0) is unrelated to both subjects — decide whether it belongs in this branch at all, and if it does, give it its own commit.
- [ ] `npm test -w @eldritch-alley/frontend` 841/841 in 61 files, `npm test -w @eldritch-alley/engine` 342/342 in 22 files, `npm test -w @eldritch-alley/game-server` 86/86 in 8 files.
- [ ] `npm run typecheck` and `npm run build -w @eldritch-alley/frontend` both pass (the build runs `tsc --noEmit` over the frontend itself).

---

### 3. Behaviour checklist

- [ ] An outline follows the mouse across the board, one tile at a time, and is gone the moment the pointer leaves the board.
- [ ] The outlined tile is the tile a press acts on, including with the camera panned and zoomed.
- [ ] Hovering a unit's figure outlines that unit's own tile, not the tile its sprite is drawn over.
- [ ] Hovering a turn-queue portrait outlines that unit's tile with the pointer nowhere near the board, and the gaps between portraits outline nothing.
- [ ] Every panel of the HUD — legend, log, gear and its panel, inspection window, ability menu, camera panel, action bar, move chips — suppresses the outline over the board behind it.
- [ ] The outline and the move/attack wash are read together on one tile; the odds badge and the outline show at once over an aimed-at enemy.
- [ ] A finger never produces an outline; the long press still behaves as before.
- [ ] The outline stays on its tile through rotation, pan and zoom, and keeps working while the bot plays.
- [ ] Nothing is outlined once the match is decided, on the result screen and with the battle report open.
- [ ] A new match opens with nothing outlined, whatever the last one left on screen.
- [ ] The hit-chance badge reads `Acerto NN%` / `Hit NN%`, and the cover badge reads `Cobertura: …` / `Cover: …`, in both languages and after a switch mid-match.
- [ ] Both badges sit on their own carbon tag, sized to their words, at a legible contrast over the brightest tile, over the darkest, and over the night sky.
- [ ] Nothing this branch sits next to changed behaviour: the wash and its chips, the selection ring, the facing arrow, the health and mana bars, right-click inspection, and the CTA of every HUD control.
