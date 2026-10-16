# MR — Reconnection after a reload, title-screen failure notice, depth table, and housekeeping

**Branch:** `feat/perfomance`
**Base branch:** `develop`
**Milestone:** M2-b (client side), plus technical debt closures
**Ticket(s):** —
**Date:** 2026-10-05

---

### 1. What this MR delivers

A player who reloads the page during a match can return to that match from the title screen, instead of
seeing "Server unavailable". The title first tries to resume the stored seat (`Session.open()`), and falls
back to a new room only when the server refuses the resume. A token the server refuses is removed, so the next
load does not try it again. A refusal is recognised by the SDK error code together with the server's own words:
a Cloudflare Tunnel timeout uses the same codes (522 and 524) with other words, so a timeout keeps the token.
A dropped connection keeps it too, since the seat may still be held.

A second tab during a match is refused with a modal that names the reason ("You already have a match open in
another tab"), instead of the generic "Server unavailable" line. The server's refusal itself is unchanged.

The match's draw order (board, highlights, units, overlay, effects) is one tested table, so an effect drawn
under the board fails a test without a Phaser harness. The branch also carries the closures of DT-12, DT-40,
DT-47, DT-60 and DT-68, and the lessons for the features closed this week.

Divergences from the approved plans, named explicitly:
- **DT-60:** the first plan kept a refused token, following section 3 of that plan. The debt's suggested fix
  removes it, and the owner asked for that. The change follows the suggested fix, narrowed: only a refusal
  recognised by its words removes the token, so a tunnel timeout is never taken for a refusal.
- **DT-68:** the plan `new-tab-during-match` put the message in the existing `alert` line. The owner asked for a
  modal the same day, so `title-error-notice` replaced that look. The wording of the first plan survives as the
  notice's body, and the first plan is marked superseded.
- **Contrast:** the title's contrast matrix records two known gaps instead of meeting the plan's 4.5:1 floor:
  the footer at about 4.02:1 and the ink on the hovered button at about 4.15:1. Raising them changes the approved
  look, so the owner decides.
- **Manual checks:** the owner ran the reload checks and the four browser checks of `new-tab-during-match` on
  2026-10-05. The reload checks ran before the token-removal rule (section 2, `session.ts`) was written, so **the
  refusal path needs one more reload check** against a real expired seat. The plans' checkboxes were not ticked
  one by one; their status lines record the runs.

---

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `frontend/src/net/session.ts` | `open()` tries `reconnect()` first, then `connect()`. `reconnect()` removes the token on a recognised refusal only | A reload during a match returns to the seat. An expired seat is not retried on every load |
| `frontend/src/net/session.test.ts` | Cases for resume, join, refusal (removes), tunnel timeout and dropped connection (keeps) | The removal rule is pinned on both sides |
| `frontend/src/title/title.ts` | `press()` calls `open()`; the failure notice replaces the alert line; focus, Escape and Tab handling | The player sees the right reason and can dismiss it |
| `frontend/src/title/connect-flow.ts` | `failed` always carries a reason; `dismiss` event | A failure cannot reach the screen without an explanation |
| `frontend/src/title/notice.ts` | Pure mapping from reason to heading and body | Refusal and load failure have separate copy in both languages |
| `frontend/src/net/join-failure.ts` | Classifies a `catch` value as `occupied` or `unavailable`; never throws | The server's `room full` becomes the "already open in another tab" reason |
| `frontend/src/view/depth.ts` | One `LAYER` table for the draw order; HUD marked as scene order | The order is tested in Node; the HUD is no longer compared with a number that does nothing |
| `frontend/src/scenes/depth-usage.test.ts` | Static guard over the scene sources | Fails on a numeric literal in `setDepth`, a depth set on the HUD scene, or a local depth constant |
| `frontend/src/view/layout.ts`, `view/iso.ts` | `HUD_DEPTH` and `EFFECT_DEPTH` removed | Both were read only by a test; the HUD has been its own scene since map-zoom |
| `frontend/src/title/contrast.test.ts` | Contrast matrix read from `title.css` | A palette change cannot leave the test checking values the page no longer uses |
| `frontend/src/title/title.css`, `frontend/index.html` | Notice styles and markup; `#alert` removed | The notice is a fixed overlay; the title's look otherwise unchanged |
| `frontend/src/i18n/*` | Notice keys in both locales | Copy is in the catalog, pinned by tests |
| `backend/game-server/src/battle-room.test.ts` | Comment only | Records that the `room full` string is what the client relies on |
| `.ia_context/inputs/*`, bundle commit `f071a7c` | Documentation closures of DT-12 and DT-40 only | The bundle code change itself is already on `develop` (`4c9b6a7`) |
| `.ia_context/` | Plans and descriptions of closed features removed; lessons added; debt files updated | Housekeeping. The knowledge is in `project-lessons/`, and the removed files are in git history |

**Verification at the head of this branch:** `vitest run` 403/403 in 38 files; `tsc --noEmit` clean. Backend
tests were not re-run for this description; the only backend change is a comment.

**Not yet verified:** the exact text Cloudflare Tunnel sends for a 522 or 524, as the SDK receives it. The SDK
takes the message from the response body, or from the status text for a non-JSON body. The rule relies on that
text not matching the server's phrases. This is expected, but it was not observed on the live tunnel.

---

### 3. What this MR does not deliver

- A second tab during a match is **refused**, not routed to its own battle or let into the existing match. The
  owner rejected both routes. Once PvP has player identity, "room full" will mean "another player is in this
  battle", and the notice's wording and the token rule must be revisited then. The plan that adds identity owns that.
- Scene-level tests with Phaser (DT-41). The depth work tests the table and the wiring, not the rendered scene.
- DT-66 (the `room full` error printed by the server suite) stays open.

---

### 4. Notes for the reviewer

- **This MR has several subjects.** Reconnection, the failure notice, the depth table and the `.ia_context`
  housekeeping are in one branch. CLAUDE.md asks for focused diffs, and debt DT-51 records the same concern.
  If the reviewer prefers, the branch can be split into: (a) reconnection and bundle closures, (b) the notice and
  its closure of DT-68, (c) the depth table, (d) housekeeping. The commits already follow that order, except the
  token-removal change in `session.ts`, which is not yet committed.
- The descriptions of earlier MRs are removed in this branch. They remain in git history and in the MRs on GitHub.
  The two files for this MR are the only ones in `.ia_context/descriptions/` that describe it.
- The contrast gaps and the token rule are deliberate, and recorded in their tests and closures.
