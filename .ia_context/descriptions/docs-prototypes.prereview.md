# Pre-review — Visual prototypes for the map and the v1 characters, plus project lessons

**Branch:** `docs/prototypes`
**Generated on:** 2026-10-04

---

### 1. What to test

There are no automated tests in this MR: the prototypes have no logic to unit-test. The checks are
visual, and they are about whether the reference is faithful to the READMEs.

Each prototype opens with no build. Open the file directly in a browser, or run `npx serve .` inside
the prototype folder. Use a desktop-sized window first.

Highest risk first:

- **Map tabs switch the scene:** open `eldritch-alley-map-prototype/index.html`. The tabs read
  "Rua e beco", "Praça da cidade" and "Telhado". Click each one: the canvas redraws, the title and
  description in the case panel change, and the protocol log changes its number (`Protocolo nº …`).
  Expect three different maps, matching the screenshots in `screenshots/`.
- **Map hover shows the cell:** hover over any cell on the street map. The cell info panel must
  update with the cell under the pointer. Move off the board: the panel must not show a stale cell
  from the previous hover. The HUD buttons are static examples: "Recarregar" is disabled, and the
  others do nothing when clicked. That is expected, not a defect.
- **Characters page renders all seven classes:** open `eldritch-alley-characters-v1/index.html`. The
  base group (Combatant, Initiate, Adept) and the advanced group (Sniper, Wizard, Priest, Street
  Vendor) must each show a card with the silhouette, the large and 1x sprite, and the action strip.
  Expect 7 cards and no empty grid.
- **Animation controls play the timelines:** on the scene, choose "Ataque de longe" and then
  "Recarga ou meditação" with the Sniper selected. The sprite must play the ranged attack (shot with a
  warm tracer), then the reload (empty magazine drops, pips refill one by one, bolt click at the end).
  Compare the duration with the timeline in the README §3: the effect ends around 1180 ms.
- **Mana classes meditate with the right effect:** select Initiate or Wizard and choose "Recarga ou
  meditação" (arcane). A magic circle must appear under the unit. Select Adept or Priest (faith). A
  cyan light beam must descend onto the unit instead.
- **Empty resource state (no magazine, no mana):** select Combatant or Street Vendor. The reload
  panel must read "Não recarrega" and the sentence "Esta classe não usa munição nem mana." Reload
  must not be offered for these classes. Sniper and mana classes must show their reload text instead.
- **Team readability on the scene:** set "Marcadores de equipe" to "Ligados" (default) and then
  "Só a braçadeira". With markers on, each unit has a ground diamond in the team colour and enemy
  diamonds carry small squares on the corners. With markers off, only the armband remains. Teams must
  be told apart by colour and by shape when markers are on.
- **Team and direction toggles:** switch "Equipe" between Aliado and Inimigo, and "Direção" between
  Direita and Esquerda. The sprites must mirror, and the outline must change to the team outline
  (blue-black for allies, dark red for enemies).
- **Speed and background toggles:** "Velocidade" Lenta must slow the animation visibly. "Fundo" Mapa
  must draw the scene map behind the sprites; "Branco" restores the plain background.
- **Offline fallback (error state):** with no network, both pages must still render. Fonts fall back
  to system monospace; the layout must not break and no control may disappear.
- **Phone width:** narrow the window to about 390 px. The text and the HUD must stay readable and the
  canvas must not force a horizontal page scroll. The map README says it was built desktop-first and
  not tuned for mobile, so a scroll or a clipped panel there is a known limit; note it, do not treat it
  as a blocker.

Data-level checks, read the files rather than run them:

- **Spritesheet dimensions:** `assets/spritesheet-ally.png` and `spritesheet-enemy.png` must be
  160×168 (10 columns of 16 px, 7 rows of 24 px); the `@4x` versions must be 640×672. Confirmed on this
  branch; re-check only if the assets change.
- **Map data format:** each map in `js/data.js` has exactly 10 rows of 10 characters. A row of the
  wrong length breaks the grid silently.

---

### 2. Code checklist

- [ ] No `console.log` or debug output in `js/app.js`, `js/data.js` or `js/characters.js`
- [ ] No external script or stylesheet beyond Google Fonts (the only external origin used)
- [ ] Each README matches the file it describes: map tiles, props and the map format; class table,
      timelines and spritesheet layout
- [ ] Numbers quoted in the READMEs match the code: the 16 px columns, the 8 px per height level, the
      140 ms shot travel and the 1180 ms end of the reload timeline
- [ ] Screenshots correspond to the state they claim to show (the file name matches the action)
- [ ] `.ia_context/README.md` line for `project-lessons/` is accurate
- [ ] The lesson's links and tags exist in `project-lessons/summary.md` (`#determinism`, `#architecture`,
      `#testing`, `#process`, `#types`)
- [ ] No Portuguese strings added outside the prototypes (see the note on this in the description, §3)

---

### 3. Behaviour checklist

Items to confirm by opening the pages. Each one is verifiable without reading code.

**Map prototype**

- [ ] The three tabs show three different maps: street and alley, park, rooftop
- [ ] The case panel title, description and protocol number change with the tab
- [ ] Hovering a cell updates the cell info; leaving the board does not leave a stale cell
- [ ] The street map shows the one-cell alley opening onto the two-lane street, with the sniper's
      overlay across the crosswalk
- [ ] The rooftop map shows a plank over the gap between buildings, and the high ground at level 8

**Characters prototype**

- [ ] Seven class cards appear, split into base and advanced groups
- [ ] Ranged attack and reload play on the scene, in that order, for the Sniper
- [ ] Mana classes show a magic circle (arcane) or a light beam (faith) when meditating
- [ ] Combatant and Street Vendor show "Não recarrega" and the matching sentence
- [ ] Team markers can be turned off, leaving only the armband
- [ ] Mirror and team toggles change the sprite and its outline
- [ ] Slow speed is visibly slower than normal

**Both pages**

- [ ] Each page renders with the network off, with system fallback fonts
- [ ] The page title is in Portuguese, as the READMEs state (`Eldritch Alley: Tactics, …`)
