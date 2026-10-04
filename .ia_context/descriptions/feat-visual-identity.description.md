# MR — Visual identity, isometric board with overlay HUD, and the first debt quick wins

**Branch:** `feat/visual-identity`
**Base branch:** `develop`
**Milestone:** M2-a (client), with the isometric board as a follow-up
**Ticket(s):** —
**Date:** 2026-10-04

---

### 1. What this MR delivers

The playable match now looks like the prototypes: the night palette and paper ink, the typewriter titles
and monospace body, 16×24 pixel-art units that walk, idle, attack and reload, and an isometric 8×8 board
built from three height levels, with the HUD (turn queue, action bar, unit panel, log, legend) floating over
the board. A player can finish a match and leave it with a button, instead of being stuck on the result
screen. The server, the protocol and the rules of the engine are unchanged, except for one new refusal
reason (`malformed-action`) that the server now sends when a client payload has the wrong shape.

**Divergences from the approved plans, named explicitly:**

- **The map variety plan is not implemented.** The commit `8df2ea5` is titled "implement map variety feature",
  but it only adds the plans and the debt entries. `backend/game-server/src/map.ts` still has the 8×8 board with
  four raised cells. The three prototype maps are the next work, and they are not in this MR.
- **The quick-win plan is partly done.** DT-20, DT-31, DT-44, DT-24, DT-52 and DT-59 are implemented. DT-47 is
  partly done (only the constant is tested). DT-32 is partly done: the server's vitest config now loads, but
  `battle-room.test.ts` and `integration.test.ts` still fail at load with `SyntaxError: Unexpected token 'with'`.
  The root `npm test` is still red for that reason, and the server test that covers DT-20 (`battle-room.test.ts`)
  has not run. DT-20 was checked by calling `resolveHumanAction` directly.
- **The isometric board follows its plans (M1 to M3).** The block faces use the prototype's colours as an explicit
  table (`FACE_COLORS`), as the M3 plan asked, and the contrast of the panels over the board is tested.
- **The branch also carries work that is not part of the identity plan:** the title-screen plans and their
  prototype, the licence files, and the debt-list reorganisation (see §2 and §4).

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `frontend/src/view/theme.ts` | The palette and type tokens: `BG_COLOR`, `TEAM_COLOR`, `PAPER_COLOR`, `FONT_TITLE`, `FONT_BODY`, `FACE_COLORS`; the letter colour is the ink with the higher contrast | Every colour a player reads is one of these; the contrast tests hold them to WCAG AA |
| `frontend/src/view/contrast.ts` | WCAG luminance and contrast ratio | The palette is chosen against the same formula the tests use |
| `frontend/src/view/unit-look.ts`, `animation.ts`, `effects.ts` | Sheet frame indexes, animation timelines in milliseconds, and the effect table per class | The sprites and their timing come from one place, so the client and the tests agree |
| `frontend/src/game/presentation.ts` | Turns each server event into the cues the scene plays (move, attack, reload, defeat, remove) | The scene only plays what the event says; the logic is tested in Node |
| `frontend/src/scenes/units.ts` | `UnitSprite`: one persistent sprite per unit, with ground marker, health bar, pips and corpse state | A redraw during an animation no longer destroys it |
| `frontend/src/scenes/BoardTiles.ts` | The board as blocks, one `Graphics` per cell, redrawn only when its level changes | Blocks stack in depth order, so a raised cell hides what is behind it |
| `frontend/src/view/iso.ts` | Projection (`cellToScreen`), picking (`cellAt`), depth and shading; `EFFECT_DEPTH = 20` | A click lands on the cell the player sees, including on a block's side face |
| `frontend/src/view/layout.ts` | The overlay rectangles, `HUD_DEPTH`, `RESULT_BUTTON_RECT`, `boardBounds` | The HUD floats over the board; clicks on a panel never reach the board |
| `frontend/src/scenes/MatchScene.ts` | HUD-first click routing, persistent sprites, the way out of a finished match (`finish`, `leave`), and removed bodies do not get a sprite | The player is never stuck on the result screen |
| `frontend/src/scenes/effects.ts` | Every effect object is drawn at `EFFECT_DEPTH` | Attacks are visible over raised blocks (DT-44) |
| `frontend/src/net/session.ts` | `close()`: leaves the room on purpose, and a leave is not reported as a drop | Leaving a match does not look like a lost connection |
| `frontend/src/game/selection.ts` | A removed body does not occupy its tile | A move onto a removed unit's tile is allowed on the client, as the server allows it (DT-24) |
| `frontend/src/scenes/widgets.ts` | The turn-queue chip shows the unit's sprite in its team colour; a fallen one is grey | The queue matches the rest of the game (DT-52) |
| `backend/game-server/src/action-shape.ts` | Checks that a client action has one of the four shapes the protocol defines | A malformed payload is refused, instead of throwing inside the engine (DT-20) |
| `backend/game-server/src/battle-room.ts`, `protocol.ts` | `resolveHumanAction` refuses a malformed action with `malformed-action`; the server's refusal type widens by that one value | The engine's `RejectReason` is unchanged |
| `backend/game-server/vitest.config.mts` | Renamed from `.ts` | The server's vitest config loads as ESM (DT-32, partly) |
| `backend/engine/src/properties.test.ts` | Explicit 30 s timeout on the property test | The property test does not fail on a loaded machine (DT-31) |
| `frontend/public/fonts/*`, `frontend/public/sprites/*` | Self-hosted Special Elite and IBM Plex Mono, and the two character sheets | No runtime request to a font CDN |
| `.ia_context/plans/{visual-identity,iso-board,title-screen,map-variety,debt-quick-wins}*` | The plans for each feature | The reviewed plans behind the code above |
| `.ia_context/inputs/technical-debt*.md`, `backlog.md` | Debt split into open debt, closed history and the feature backlog | Planned features are no longer listed as debt |
| `ASSETS_LICENSE.md`, `README-license-section.md` | Licence of the code (MIT) and of the creative assets | Not part of the feature; see §4 |
| `.ia_context/prototypes/eldritch-alley-title-screen/` | The title-screen prototype | Reference for a future feature; not used by the client yet |

### 3. What this MR does not deliver

- The three prototype maps and the one-of-three-per-match draw (`map-variety` plans). The board is still 8×8.
- The title screen. The client still opens on the lobby.
- Movement across more than one tile in one action (pathfinding, backlog DT-54).
- The fix for DT-60: after a refresh in the middle of a match, the lobby shows "Servidor indisponível" instead of
  returning to the battle. Suggested fix is recorded in the debt list.
- DT-32 (server test suite): the root `npm test` is still red.

### 4. Notes for the reviewer

- **This branch mixes several subjects.** `CLAUDE.md` rule 5 asks for one subject per diff. Consider splitting it
  before the merge: the identity and the board belong together; the title-screen plans and prototype, the licence
  files, and the debt-list reorganisation can go in their own branches. The owner has not decided this yet (DT-51).
- **The commit `8df2ea5` says "implement map variety feature" but adds no code.** Please read it as a plan
  commit.
- **Manual checks are the owner's.** The look (identity, board, HUD, effects) was approved by the owner on screen.
  The owner also confirmed DT-30, DT-42, DT-44, DT-59, DT-24 and DT-52 in the browser. Do not treat the automated
  tests as the acceptance of the visuals.
- **Known open defect for the reviewer's attention:** DT-60 (refresh in the middle of a match).
- **The count of tests:** frontend 203 passing; engine 122 passing; server tests cannot run yet (DT-32).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
