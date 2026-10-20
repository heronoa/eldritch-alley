# Plan — m4 · Client visuals: the white silhouette, the prone sprite and the mud overlay

**Milestone:** m4-client-visual
**Parent feature:** secondary-abilities
**Created:** 2026-10-17
**Status:** pending
**Depends on:** m3-client-logic approved

## 1. Objective

The match screen shows what the new rules are doing. A camouflaged Sniper carries a **white glow in
the shape of its own silhouette**, fading in and out while the status lasts. A prone unit's **sprite
lies on its side** until it stands up. Every cell of `difficultTerrain` carries a **mud overlay** on
the map. The resurrection's two clicks are guided by the existing HUD, and the new events move the
pieces the way m3's cues say.

The layer's contract is the scene: it reads `PublicState` and the cues and draws them. It adds no
rule and no message.

## 2. Files changed

| File | Operation | What changes |
|------|-----------|--------------|
| `frontend/src/scenes/units.ts` | modify | A second silhouette sprite behind the figure for camouflage; the prone rotation and its offset; both stay in `sync`/`follow` |
| `frontend/src/scenes/map/MapView.ts` | modify | A mud layer per difficult cell, above the map and below the units, rebuilt when the cell list changes |
| `frontend/src/scenes/effects.ts` | modify | The camouflage pulse tween and the revive/stand/dry cues m3 maps |
| `frontend/src/scenes/MatchScene.ts` | modify | Two-step revive state, camouflage/prone/mud updates on state and events, HUD guidance |
| `frontend/src/scenes/HudScene.ts` | modify | The two-row ability panel is drawn from the existing layout constants; the waiting-for-cell line |
| `frontend/src/view/theme.ts` | modify | The mud and glow tokens |
| `frontend/src/view/theme.test.ts`, `frontend/src/view/theme.contrast.test.ts` | modify | The two new tokens are defined once and their pairs keep the contrast floor |
| `frontend/src/scenes/MatchScene.test.ts` | modify | The scene-level rules: the two-step state, the flags reaching the sprites, the overlay rebuild |
| `frontend/src/view/layout.test.ts` | no change | Covered by m3 |
| `frontend/src/scenes/depth-usage.test.ts` | modify | The mud layer sits between the map and the units; the glow behind the figure |

## 3. Contract of the layer

### 3.1 The camouflage silhouette

`UnitSprite` gains a second sprite of the **same texture and frame**, drawn **behind** the figure, in
white and at the silhouette's alpha. Rules:

- visible only while `unit.camouflage !== null` and the unit is not defeated;
- the alpha pulses between roughly 0.15 and 0.45 with a yoyo tween, so it fades in and out while
  active;
- it follows the same position, rotation and flip as the figure, and it is hidden with it when the
  unit falls;
- `markDefeated` hides it; `sync` reads `camouflage` and shows or hides it without restarting the
  tween every frame.

The glow is a drawing of the state, not an event: a late join shows it exactly as a live client does.

### 3.2 The prone sprite

- When `unit.prone` is true, the figure is rotated **90°** and offset so the body lies on the floor
  rather than standing through it. The tint, the selection ring, the health bar and the facing
  marker stay upright, because they belong to the cell and not to the pose.
- The rotation animates in the existing rotation/animation helpers where they fit; otherwise a short
  tween drives it. It is applied by `sync`, so a join mid-match sees the pose.
- The pose is held from the prone stop until the `stood-up` cue; the standing pose returns then.

### 3.3 The mud overlay

- `MapView` keeps one canvas (or one diamond per cell) for the difficult cells, drawn in the mud
  token's tones, above the board marks and **below** the units and their bars.
- The layer is rebuilt when the set of cells or their expiries change; a cast that covers an existing
  cell redraws it without adding a second diamond.
- `terrain-expired` removes the cells it names; the next state sync removes any cell the state no
  longer carries.
- The marks toggle (ADR 0012) hides the cover badges only; the mud is a rule mark of its own and
  follows the same setting, so the board is not noisy when the player turns marks off.

### 3.4 The scene

`MatchScene` holds the two-step state from m3: `reviveTargetId` enters `ClickInput`, the first click
on a body arms it, the second on a cell sends the action. The HUD says which step is waiting — the
body or the cell — using the existing hint line; an invalid second click writes the refusal m3 chose.
The scene handles the four new events:

| Event | The scene does |
|---|---|
| `camouflage-ended` | hides the silhouette on the next sync; the cue is the fade |
| `stood-up` | returns the figure to the standing pose |
| `terrain-expired` | removes the named cells from the overlay |
| `revived` | brings the unit's sprite back at `to`, standing, and re-adds it to the turn order row |

`HudScene` already loops over `ABILITY_MENU_ROWS`; m3 changed the constant to 2 and the panel grows
with it. This milestone checks the two rows render and the second row is clickable.

### 3.5 What this layer does not do

- No rule, refusal or message is re-implemented; the server and m1 own them.
- No new HUD panel and no status row in the unit sheet (I8).
- No animation timeline beyond the pulse, the pose and the existing event cues.
- No audio, no particle system, no shaders.
- No change to the ability menu's logic, the log or the catalogs (m3).

## 4. Planned tests and manual checks

**Automated (`MatchScene.test.ts`, `depth-usage.test.ts`, theme tests)**

- [ ] A unit with `camouflage !== null` shows the silhouette; setting it to null hides it; a defeated
      unit never shows it.
- [ ] A unit with `prone` true is drawn rotated; `prone` false is drawn standing.
- [ ] A state with difficult cells paints exactly those cells, and a state without them paints none.
- [ ] Adding and removing cells rebuilds the overlay without duplicating a cell.
- [ ] The mud layer's depth is above the map and below the units.
- [ ] The glow's depth is behind the figure.
- [ ] The two new theme tokens are defined once, and the contrast tests hold for the pairs they are
      used on.

**Manual, in a real match at desktop and phone width**

- [ ] The Sniper casts camouflage: the white silhouette appears behind the figure, pulses, and does
      not show on the HUD portrait or on other units.
- [ ] The Sniper attacks and the break fires: the silhouette fades out when the action resolves, and
      the log says it broke.
- [ ] Three turns pass: the silhouette fades at the end of the third, and the log says it expired.
- [ ] An enemy tries a basic attack on the camouflaged Sniper: the client refuses with “Target
      hidden”; an area cast aimed at the cell still previews and hits.
- [ ] The Wizard casts mud: the 3×3 overlay appears, survives a walkthrough, and disappears at the
      start of round R+3 with the log line.
- [ ] A unit walks into mud and the prone roll fires: the sprite lies down on that cell, the turn
      passes, and on its next turn it stands with half the movement shown in the HUD.
- [ ] The Priest selects a fallen ally's body, sees only the free cells in range highlighted, picks
      one, and the unit comes back at full HP; its sprite returns on the chosen cell and its row
      reappears in the turn order.
- [ ] A class with two rows opens the ability menu: both rows are readable, both clickable, and the
      panel keeps its margins at 360 px.
- [ ] Every new log line is in the selected language, and both languages read naturally.
- [ ] Nothing overlaps: the mud does not hide a unit, a body or a health bar; the glow does not tint
      the selection ring.

## 5. Dependencies

- **m3 approved.** The intents, the cues, the strings and the layout constants are m3's; this
  milestone consumes them.
- No new asset is required: the silhouette reuses the unit's own texture with a white tint.

## 6. Out of scope

- Rules, protocol, catalog and bot (m1, m2).
- The menu logic, the log and the catalogs (m3).
- A new unit sheet, a status panel or a tooltip (I8).
- A visual effect for the mud's 20% roll other than the pose; the log carries the event.
- Performance work beyond rebuilding the overlay on change rather than every frame.
