# MR — Visual prototypes for the map and the v1 characters, plus project lessons

**Branch:** `docs/prototypes`
**Base branch:** `develop`
**Milestone:** —
**Ticket(s):** —
**Date:** 2026-10-04

---

### 1. What this MR delivers

Two static, browser-only prototypes that fix the visual direction before the Phaser client is
touched: three battle maps (street and alley, city park, rooftop) in the "Occult Bureaucracy" art
direction, and the seven v1 classes with their animations, basic attacks, reload and meditation, and
team markers. Anyone can open each `index.html` directly, with no build and no server, and see what the
client is meant to draw. The two READMEs are the handoff: the map README records the level design
intent (why the alley punishes large groups, why the rooftop forces a climb) and the rules those maps
surfaced (line attacks, falling, isometric occlusion), and the characters README gives the timelines in
milliseconds and the suggested client slices. The game client does not change, so nothing playable is
different after this MR; what changes is that the next client plan has a reference to point at.

This MR also carries a second, unrelated commit: the `project-lessons/` folder with the first lesson
(`engine-m1`) and its index. It is in this branch by accident of sequencing, not by design, and it is
the one place where the diff is not about the prototypes. See the divergences below.

**Divergences from the approved plans, named explicitly:**

- **No plan exists for this branch.** The prototypes were not produced from a `plan.md`. The two
  prototype READMEs take the place of the spec: the characters README says to write a plan for each
  client slice and wait for approval before coding, which this MR does not do because it does not code
  anything. Each client slice still needs its own plan.
- **The branch mixes two subjects.** `CLAUDE.md` rule 5 asks for one subject per diff. The lessons
  commit (`dcca8a9`) documents the closed `engine-m1` feature and is unrelated to the prototypes. It
  could be split into its own MR; the reviewer may prefer that. The `.ia_context/README.md` line that
  points to `project-lessons/` belongs with it.
- **Portuguese UI strings in the repository.** `CLAUDE.md` rule 6 and `.ia_context/README.md` both say
  everything in the repository is English. The prototypes are Portuguese on purpose: both READMEs state
  that UI strings are in Portuguese, "the current prototype language", to be translated when the
  content moves into the client. This is an exception to the rule, not an oversight, but it is an
  exception, and it is listed in §3 for a decision.

### 2. What changed and why

| File | What changed | Why it matters |
|------|--------------|----------------|
| `.ia_context/prototypes/eldritch-alley-map-prototype/index.html` | Map tabs (street and alley, park, rooftop), canvas, HUD overlay | Opens with no build. The tabs are the only way to compare the three maps side by side |
| `…/map-prototype/js/data.js` | Palette, tile types, the three `MAPS` definitions, placeholder sprites | The level data is the part the client will need to reuse. Its format is documented in the README |
| `…/map-prototype/js/app.js` | Isometric renderer, props, backdrops, hover info, HUD wiring | Shows the projection rule (`screenX = OX + (x − y)·16`, eight pixels per height level) the client must match |
| `…/map-prototype/README.md` | Art direction, token table, level design intent, map data format, known limits | The document to read before changing a map. It records why each layout is the way it is |
| `.ia_context/prototypes/eldritch-alley-characters-v1/index.html` | Consolidated prototype: class cards, animation controls, scene with team markers | One page instead of the earlier separate sprite and attack pages, which the README says it supersedes |
| `…/characters-v1/js/characters.js` | Seven class definitions, sprite drawing, outline, attack, reload and meditation timelines, team markers, scene | The timelines (`ATTACKS`, `RELOAD`, `drawStage()`) are the values the client's animation player will copy |
| `…/characters-v1/assets/spritesheet-{ally,enemy}{,@4x}.png` | 160×168 sheets at 1x (640×672 at 4x): 10 columns of 16 px, 7 rows of 24 px | The exported art the client can load directly, or regenerate from the drawing code. Rows and columns are documented in the README |
| `…/characters-v1/README.md` | Classes, animations, combat rules as shown, timelines, team readability, client slices, out of scope | The rules the engine and server will need: one attack per class with one cost, distance only changes the animation, resources are none, ammo or mana |
| `…/*/screenshots/*.png` | Captures of each map, class, attack, reload, meditation and team marker | Review aid. Lets a reviewer compare the prototype with the README without opening the browser |
| `.ia_context/project-lessons/summary.md`, `lessons/engine-m1.lesson.md` | Index, tag glossary and the first lesson, from the closed M1 engine feature | Not part of the prototypes. Records what to know before repeating deterministic-engine work (see the divergence in §1) |
| `.ia_context/README.md` | One line describing the `project-lessons/` folder | Makes the new folder discoverable |

Neither prototype has game logic, a server or input beyond hover, by design. The map's hover panel and
the characters' controls are the only interaction, and they exist to inspect the art, not to play.

### 3. Notes for the reviewer

- **Portuguese strings are intentional for now.** Both `index.html` files, `app.js`, `characters.js`
  and the map data carry Portuguese UI text, which the READMEs flag for translation when the content
  moves into the client. Whether that is acceptable inside the repository is an open decision (see
  §1); the reviewer should decide it, not the author.
- **The prototypes load two external resources.** Fonts come from Google Fonts; without network the
  page falls back to system monospace fonts, as the map README states. No other external script or
  stylesheet is loaded.
- **Screenshots are binary and add about 1.9 MB.** They are the fastest way to see the result without
  running anything. The 4x spritesheets are there for review; the client should use the 1x sheet or
  generate textures from the drawing code, as the characters README recommends.
- **The prototypes are references, not code to ship.** Porting them is the job of the client slices
  listed in the characters README, each with its own plan and MR. Reviewing this MR is about whether
  the reference is clear and correct, not whether it is production quality.
