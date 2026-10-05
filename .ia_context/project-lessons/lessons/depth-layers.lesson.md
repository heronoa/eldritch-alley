# Lesson — One table for the draw order of a Phaser scene, tested in Node

**Feature:** debt-dt47-depth-layers (`debt-dt47-depth-layers.plan.md`; DT-47; `frontend/src/view/depth.ts`)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

Phaser draws objects by depth, and the match's depths were spread over five files. A regression like DT-44 (an
attack effect drawn under the board) passed every test, because no test read the scene. Testing the scene
needs a Phaser harness the project does not have. The risk was a second layer of rules that the tests could not
reach.

---

## Decisions worth reusing

**Every depth in one pure table, and the scenes read only from it**

- Situation: the order of the board, highlights, units, overlay and effects was defined in five places, and
  each place could drift.
- Decision taken: `view/depth.ts` exports one `LAYER` object. The order is tested in Node. The scenes take their
  values from the table, and no scene declares a depth constant of its own.
- Alternative rejected: a scene-level test with Phaser objects. The project has no harness for it, and building
  one is a separate debt (DT-41).
- Applies when: a canvas or engine draws by an ordering key. Put the keys in a pure module and test the order there.

**The HUD is not a number in the table**

- Situation: the HUD had a depth of 100, but since it became its own scene, the depth did nothing. The scene list
  decides what is on top.
- Decision taken: the table records the HUD as `'scene-order'`. The number was removed.
- Applies when: a layer is enforced by something other than the value you would expect. Write the mechanism
  down, so a reader does not trust a number that no longer governs anything.

**A static guard for the mistakes a test cannot see**

- Situation: a test reading the table cannot know whether a scene uses it.
- Decision taken: `scenes/depth-usage.test.ts` reads the scene sources, as the engine's forbidden-pattern test
  does. It fails on a numeric literal in `setDepth`, a depth set on the HUD scene, or a depth constant declared
  outside the table.
- Applies when: a rule is about how a module is used, not about its values. Scan the source, and say in the test
  what the scan cannot prove.

---

## Armadilhas encontradas

**A test that asserted a constant that no longer governed anything**

- Sintoma: `iso.test.ts` checked that the effects sat below `HUD_DEPTH`, and the test passed.
- Causa real: the map-zoom feature had moved the HUD into its own scene, and no `setDepth` call used the constant
  any more. The test was checking a number with no effect on the screen.
- Solução: the constant and its assertion were removed, after reading the git history to confirm that map-zoom
  had removed the last use. The order is now tested through the table.
- Sinal de alerta: a constant that only tests read. Search for its uses in the scenes before trusting a test
  that depends on it.

**A pattern that flagged zoom steps as depths**

- Sintoma: the static guard failed on `WHEEL_ZOOM_STEP` and `KEY_ZOOM_STEP`.
- Causa real: the first pattern matched any constant ending in `STEP`.
- Solução: the pattern now matches only names that contain `DEPTH`.
- Sinal de alerta: a guard that fails on a file it was not written for. Read what it matched before changing the code.

---

## O que fazer diferente

- [ ] When a feature moves a layer to another mechanism, search the tests for the old constant in the same change.
- [ ] Write each static guard with a comment that says what it cannot prove.
- [ ] Check every pattern against the real files before the first run, so the first run is about the rule.
