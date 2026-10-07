# Pre-review — Camera controls (pan, pinch zoom, 90° rotation, cutaway) with the smoke test 2 HUD feedback

**Branch:** `fix/camera-controls`
**Generated on:** 2026-10-06

---

### 1. What to test

Run `npm run dev:game-server` and `npm run dev:frontend` from the root and play against the bot, unless a
step says otherwise. Organised from most to least critical.

**1. DT-81 — the chips after a full-budget move (the one open debt, and the reason this branch is not
finished).** The plan's step 4: add the logging described in `.ia_context/inputs/technical-debt.md` inside
`MatchScene.pushHud` and `HudScene.render`. Move a unit using its whole movement budget, then look for the
Confirmar/Cancelar chips. Expected if the scene is at fault: `state.pendingMove` is set and `chipModel` has
two chips while the HUD draws none — the fault is in `HudScene.drawMoveChips`. Expected if the server is at
fault: `pendingMove` is already gone in the state the scene receives. Record whichever it is in the debt and
close it; without this run the debt stays open and EA-5's acceptance stays blocked.

**2. The drag sensitivity setting.** Open the gear (top-right corner). Expected: the panel opens under the
camera panel with two rows, the toggle and `Arrasto do mapa  − 50% +`. Press `+` twice: 75 %, then 100 %,
where the `+` greys out and a further press changes nothing. Press `−` down to 25 %, where the `−` greys out.
Reload the page: the value is the one chosen. Open the game in a second tab while the first is in a match:
the second tab is refused, as before, and a fresh match opens at the stored value.

**3. The drag itself, at each end.** At 50 %, drag a tile a finger's width and confirm the map moves about
half as far as the finger — this is a deliberate change, the map now trails the finger. At 25 % it is
visibly slower again, at 100 % it is the 1:1 drag of before. Then press an arrow key or WASD: the map moves
80 px per press at *every* value of the setting. Pull the map far past the board edge in each direction:
it stops with a quarter of a screen of slack and never leaves.

**4. Zoom.** Wheel over the board, the `+`/`−` of the camera panel, and a two-finger pinch on a touch device
or in the emulator. Expected: whole steps from 1× to 4×, the panel reads the step, and the point under the
cursor or under the pinch stays put. During a pinch the zoom follows the fingers fractionally and settles on
a step when one lifts — that is intended, and it is what stops the pixel art from showing seams.

**5. Rotation.** Press Q and E, then the panel's ⟲ and ⟳. Expected: a 450 ms eased quarter turn, and the
detailed board back at the end. Press again mid-turn: the second turn is refused. **During the turn, tap a
tile the player can move to:** nothing happens, and nothing is sent (DT-86). After the turn settles, tap the
same tile: the unit moves to the tile you see, not to the one that was there before the turn — check this at
all four views, and check that a crosswalk and a car's bonnet also come out right in each view.

**6. The cutaway.** Go to the rooftop map and turn until a tall building has open ground behind it. Expected:
the building is drawn two levels tall with a hatched top. Stand a unit behind a building that hides it:
the building goes to 28 % opacity. Then tap the cut roof: it still resolves as a wall, because the cutaway is
display only. A building *in front of* a unit must never become translucent.

**7. Targeting by figure.** Click a unit on its head and on its feet rather than on its tile. Expected: the
unit is selected both times. Zoom to 4× and repeat: the same coverage, because the hit margin is divided by
the zoom. Put two figures on top of each other: the one drawn in front is the one selected. Click a figure
that is not selectable in the current mode and confirm the log says why, with the engine's own reason
("Alvo fora de alcance", "Sem linha de visão"), instead of nothing happening.

**8. The inspection window.** Long press a figure, or use the right mouse button. Expected: a 400×240 sheet
over the middle of the board, titled with the unit, with four rows — HP over maximum, ammunition over the
magazine or mana as `—`, the unit's maximum movement, and its reaction as 0 or 1. Press the X: it closes.
Press the board while it is open: the press acts as it normally would and the window stays, with its
inspection highlight still on — so the player's own move or attack highlight is hidden until the X is
pressed. This is the owner's decision Q4, and it is the behaviour to sanity-check against what he expected.
Check a unit that is already dead: no window.

**9. The dashboard and the log.** The board must not be covered on the left any more. Expected: health at
the bottom left with its bar, ammunition or mana at the bottom right, the four buttons centred, the
`Movimento · Ação · Reação` line under them, and the chips above the dashboard with their labels inside their
boxes (DT-83). The log starts closed, showing its header and the last line; clicking the header opens six
lines and closes them again; clicking the log's body neither toggles it nor reaches the tile underneath.
After more than six events, the oldest lines are gone for good.

**10. Clicks never leak through a panel.** With the settings panel open, click its title and the gaps between
its controls: nothing on the board reacts and the setting does not change. Same for the camera panel's gaps,
the log's body and the inspection window's body. Then click the gear again: the panel closes.

**11. Error and empty states.** In a private window or with storage blocked, the game must open at 50 % and
the stepper must still work, without an exception in the console. With the game server down, or with a
protocol mismatch, the existing title and version notices must still appear unchanged. Empty log on a fresh
match: the closed box shows its header and no line, without an empty line box.

**12. Device pass.** iOS Safari and Android Chrome in portrait, plus desktop Chromium. The plan and the
prototype README both require it, and nothing in the repository can stand in for it. Watch the frame rate
during a rotation while you are there: DT-88 is about that cost, and a profile here is what closes it.

---

### 2. Code checklist

- [ ] The new modules under `frontend/src/game/` and `frontend/src/view/` import nothing from Phaser, and
      `view/layout.ts` stays pure geometry.
- [ ] `HudScene` still draws only: no `setDepth`, no game rule, no coordinate of its own — `depth-usage.test.ts`
      and the layout tests are the guards, and both are green.
- [ ] Every rectangle a control is hit-tested with is the same one it is drawn from (`buttonRect`,
      `cameraControlRect`, `moveChipRect`, `inspectRowPoint`, `logRect`, `SETTINGS_PAN_*`), and the scene
      imports them from `view/layout.ts` rather than writing a literal (DT-30).
- [ ] `panFactor` appears in exactly one place, the drag branch of `handlePointerMove`. The keyboard path and
      the wheel must reach `moveCameraBy` untouched.
- [ ] `terrainOf` returns a new object and nothing writes to `PROTOTYPE_MAPS`; the four-view round trip in
      `maps/terrain.test.ts` is the evidence.
- [ ] A rotation never sends anything to the server, and no protocol or engine file is in the diff.
- [ ] No `any` added without a justification, and no `console.log` or debug code left in the diff.
- [ ] Both catalogs carry the new keys; `catalog.en-US.ts` is complete by type, so a missing one would not
      compile in the first place.
- [ ] Nothing under `frontend/` or the build references `.ia_context/prototypes/eldritch-alley-camera-prototype/`.
- [ ] `npm test -w @eldritch-alley/frontend` 643/643 in 51 files; `npm test -w @eldritch-alley/engine` 200
      passed with 2 todo; `npm test -w @eldritch-alley/game-server` 63/63.
- [ ] `npm run typecheck`, `npx tsc -p frontend/tsconfig.json --noEmit` and
      `npm run build -w @eldritch-alley/frontend` all pass.
- [ ] The debt bank matches the code: DT-72, DT-79, DT-82, DT-83, DT-84, DT-86 and DT-87 in the closed list
      with their resolution, DT-81 open with its narrowing note, DT-85 and DT-88 recorded, DT-89 in the backlog.
- [ ] Nothing in the diff is outside the plan, other than the drag sensitivity the owner asked for and the
      `camera-prototype` folder the EA-12 plan names as its reference.

---

### 3. Behaviour checklist

- [ ] The map drag is calmer at the default of 50 %, and the setting changes it without touching the keys.
- [ ] The chosen sensitivity survives a reload.
- [ ] Zoom runs 1×–4× from the wheel, the panel and a pinch, and keeps the point under the finger.
- [ ] A rotation is a clean 450 ms turn that ends on the detailed board, and a tap during it does nothing.
- [ ] A tap after a rotation lands on the cell the player sees.
- [ ] A tall building with open ground behind it is cut, and a building hiding a unit goes translucent —
      never a building in front of one.
- [ ] A click anywhere on a figure selects it, at every zoom, and the front figure wins a tie.
- [ ] A refused order prints the engine's reason in the log.
- [ ] The inspection window opens on a long press, shows its four rows, and closes only with its X.
- [ ] The board is not covered on the left, and the chips' labels fit inside their boxes.
- [ ] The log starts closed, toggles from its header, and never leaks a click to the tile under it.
- [ ] No click inside any panel reaches the board, gaps included.
- [ ] With storage blocked, the game opens at 50 % and the stepper still works.
- [ ] The turn chip, the standing sprite and the figure drawn during a rotation are the same sprite, facing
      the same way.
