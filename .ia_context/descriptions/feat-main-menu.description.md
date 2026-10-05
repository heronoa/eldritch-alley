# MR — Title screen: living city, character walkers and a call to action that starts a match

**Branch:** `feat/main-menu`
**Base branch:** `develop`
**Milestone:** —
**Ticket(s):** —
**Date:** 2026-10-04

---

### 1. What this MR delivers

The game now opens on a title screen instead of the old lobby. Behind the game name, an isometric
city runs on a fixed 16×16 map, with the seven v1 characters walking its streets and playing their
ambient actions; a stamp and a call to action sit on top of it. Pressing "Iniciar partida" (or Enter)
opens the session with the server and, once the server confirms it, starts a match against the bot.
If the server does not answer, the stamp goes away and "Servidor indisponível" appears, so the player
is never sent into a black game screen. The Phaser game is created only at that moment, so the title
costs nothing but its own page until the button is pressed. This is the entry point the rest of the
client will hang from.

Decisions with consequences for the player and the next work:

- **The title is an HTML page, not a Phaser scene.** Phaser's `Scale.FIT` would draw the 18 px button
  at about 5 px on a 390 px phone in portrait; CSS scales the title correctly. The match still uses
  Phaser, unchanged.
- **The city is only the title's backdrop.** The match board stays flat, as visual identity decision 2
  states (the title plan records this).
- **The Phaser game exists once per page.** `startMatch` throws on a second call, so a match cannot be
  replaced silently by another.
- **Scenes are added by `startMatch`, not declared in the config.** Phaser started the first scene
  with empty data before the session arrived, and the match threw on it (a black screen). Adding the
  scenes from code, while the game boots, fixes it.
- **The title's copy lives in one file** (`title/copy.ts`), so the upcoming localization changes one
  module.
- **Reduced motion is respected:** with `prefers-reduced-motion`, the walkers stop and the stamp only
  fades.

**Divergences from the approved plans, named explicitly:**

- **The plan index still says M2 and M3 are pending.** `title-screen.index.md` marks M2 and M3 as
  `[ ] pendente`, but the code for both is in this branch (commits `7465af4` and `13e66ec`). The
  index and the M2 and M3 plans must be updated to `concluído`, or the M2 and M3 work must be reviewed
  as a separate step, before this MR is merged.
- **The M2 plan's `startMatch` contract changed in implementation.** The plan's sketch used
  `scene: [BootScene, MatchScene]` with `READY`. The code adds the scenes with `game.scene.add` instead,
  for the reason above. The plan file records the change; the reviewer should read that part.
- **The localization plan is in this branch by accident.** `.ia_context/plans/localization.index.md`
  came in with `13e66ec`. It is a separate subject (CLAUDE.md rule 5) and should be moved to its own
  branch before merge.
- **The branch mixes subjects.** Title-screen code, the match bootstrap change and the localization
  plan share one MR. The first two are one subject; the plan is not.

---

### 2. What changed and why it matters

| File | What changed | Why it matters |
|------|--------------|----------------|
| `frontend/src/title/city-data.ts` | Fixed 16×16 tile, height and prop data | The city is the same on every visit; it is data, not a random generator, so it can be reviewed |
| `frontend/src/title/walkers.ts` | Seven walker paths, step function, ambient triggers | Pure logic, testable in Node, with the timing of the prototype |
| `frontend/src/title/ambient.ts` | Ambient action per class, duration and frame timeline | Each character's animation is decided here, not inside the renderer |
| `frontend/src/title/stamp.ts` | Stamp timeline: 180 ms slam, 1600 ms hold | The stamp never shows before the server answers, and the 180 ms slam is respected |
| `frontend/src/title/connect-flow.ts` | State machine for the call to action | Double presses and failures are handled in one place, with tests for each transition |
| `frontend/src/title/motion.ts` | Motion policy from `prefers-reduced-motion` | Accessibility decided once, read by the walkers and the stamp |
| `frontend/src/title/copy.ts` | Every title string | One file to change when the text changes |
| `frontend/src/title/city-render.ts` | Canvas renderer of the city and the walkers | The title's only drawing code; the match is not affected |
| `frontend/src/title/sheet.ts` | Frame access to the sprite sheets | Shares the frame layout with the match |
| `frontend/src/title/title.ts` | Wires the title page: button, Enter, connection, `startMatch` | The only caller of `startMatch` |
| `frontend/src/title/title.css` | Title styles and responsive layout | Fits the phone and desktop layouts; colours come from the title's own tokens |
| `frontend/src/main.ts` | Game config without `scene`; `startMatch` adds the scenes; shows the game canvas | The game is created on demand, once per page |
| `frontend/src/scenes/BootScene.ts` | Takes the session from `init`; no title text, no delay; hands the session to the match | The boot is now only the loader for the match |
| `frontend/src/scenes/LobbyScene.ts` | Removed | Replaced by the title page |
| `frontend/index.html` | Title markup: city canvas, name, stamp, call to action, footer | The page the player sees first |
| `frontend/public/sprites/spritesheet-neutral.png`, `…-blink.png` | Neutral sheet with the grey armband, and its blink frame | Used by the title's neutral characters |
| `.ia_context/plans/title-screen-*.plan.md`, `title-screen.index.md` | Updates to M1 and M2 plans; index unchanged for M2 and M3 status | Records the implementation decisions (see divergences) |
| `.ia_context/plans/localization.index.md` | Localization plan | Out of subject for this MR (see divergences) |

Tests: 27 test files and 307 tests pass (`vitest run`), and `tsc --noEmit` is clean. The title's
logic modules have tests of their own: city data, walkers, ambient, stamp, connection flow, copy and
motion.

---

### 3. What this MR does not deliver

- **English copy and language switch.** Planned in `localization.index.md`, M3.
- **Team selection in the title.** Explicitly out of scope; the call to action always starts a bot
  match with the same flow as before.
- **Backend changes.** None. The protocol does not change.

---

### 4. Notes for the reviewer

- The title is presentation only. It is client code outside `backend/engine`, and it does not feed
  any state back into the match. The engine rules (ADR 0005, integer math) apply to the engine, not to
  the title's animation.
- The title's contrast fixes (the meta line and the footer) follow the title plan. The full contrast
  matrix and the responsive check are the M3 plan's deliverables, and the M3 plan is not closed yet
  (see divergences). Check them in the pre-review before merging.
