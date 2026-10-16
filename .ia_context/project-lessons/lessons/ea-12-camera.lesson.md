# Lesson — Rotating the view: a client-only illusion with four invariants

**Feature:** ea-12-camera (`ea-12-camera.plan.md`, client only, five slices; delivered in PR #16, branch `fix/camera-controls`; closes DT-67)
**Date:** 2026-10-07
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The player wanted to look at the map from other sides. Rotation is not a camera move: it changes the projection,
the depth order of cells and units, the picking function and every orientation-dependent prop. It had to be done
without the engine knowing anything, and without a tap ever landing on the wrong cell.

---

## Decisions worth reusing

**Rotate the data on the way to the screen, and un-rotate the point on the way back**

- Situation: four views would otherwise mean four projections, four depth orders, four picking functions and four
  readings of every prop — which is why the backlog item had sat there.
- Decision taken: `rotateCell` / `unrotateCell` in `frontend/src/view/rotation.ts`, one pair of inverses. A tap
  converts the screen point to a cell and passes it through `unrotateCell`. A round trip over every cell of every
  map in every view is the test that proves the tap survives.
- Alternative rejected: four drawing routines, one per view.
- Applies when: a view transformation is added over an interactive surface. One map each way, and a round-trip
  test over real data rather than a few example cells.

**Rotation is a reading, never a mutation**

- Situation: the map data is shared with the tests and mirrors the server's.
- Decision taken: `terrainOf(id, steps)` returns a view-turned map, so `PROTOTYPE_MAPS` is never turned in place;
  DT-87 pins it with a snapshot comparison over all four views of every map, and the engine state is provably
  unchanged by a rotation.
- Applies when: a transform could be applied to data more than one module holds. Return the turned reading.

**Orientation-dependent detail is derived from neighbours**

- Situation: crosswalk stripes, lane markings, curbs, fences, parapets and cars all look different from each
  side.
- Decision taken: each is recomputed from its neighbours and stored as an edge; cars are placed from
  `CAR_FRAME[view]`. One drawing routine, no per-view tables.
- Applies when: a detail is orientation-dependent. Derive it from the neighbours rather than tabulating four
  versions.

**A drawing simplified for legibility says so, and the rules do not follow it**

- Situation (slice 4): a building of four levels or more with open ground behind it hides the fight.
- Decision taken: it is *drawn* at two levels with a hatched top, and its rules still use the full height — so a
  tap on a cut roof resolves against the true level. The MR names this as "the first thing that reads as a bug",
  and intended.
- Applies when: the view simplifies something the simulation does not. Write the divergence in the code beside
  it, because it will be reported as a defect.

**Slices with their own reviews, and permission to ship the polish later**

- Situation: rotation is a lot of surface, and the look of the animation was the least important part.
- Decision taken: five slices, each with its own acceptance; slices 1–3 before the deploy, 4 (visibility rules)
  and 5 (sprites facing the camera) allowed to land after, and the owner decides. DT-88 (a full-canvas texture
  uploaded every frame) and DT-89 (the low-poly look) are recorded as the price, behind a measurement.
- Applies when: a visual feature is larger than one review. Cut it so each piece ships and can be accepted on its
  own.

**The pure part is separated from Phaser**

- Situation: this project has no browser test harness, and a scene cannot be instantiated in Node.
- Decision taken: `camera-math.ts`, `rotation.ts`, `rotation-animation.ts`, `cutaway.ts` and `billboard.ts` are
  pure and tested in Node; the scene reads and writes them and decides nothing.
- Applies when: the code has maths in it and the project cannot render. The maths goes where a test can reach it.

---

## Armadilhas encontradas

**A debt that asked for a test was really asking for a design change**

- Sintoma: DT-79 and DT-84 — "pointer, pinch and rotation driving in the match scene has no automated test".
- Causa real: the rules were scene code, and the project cannot test scene code.
- Solução: not a harness. The rules became `frontend/src/game/press.ts` — a pure module that turns pointer events
  into one declarative outcome (`begin`, `tap`, `pan`, `pinchBegin`, `pinch`, `inspect`, `none`) — and the scene
  became an adapter that keeps only what is Phaser's (the timer, the camera). 16 cases in `press.test.ts`, plus
  two scene-level cases pinning the wiring.
- Sinal de alerta: a debt phrased as "X has no test". Ask what pure module would make the test trivial; the
  answer is usually a better design, not a test harness.

**A prototype in the repository, and nobody says it is not a dependency**

- Sintoma: the camera prototype is canvas without Phaser, sits under `.ia_context/prototypes/`, and is about
  1.08 MB.
- Solução: the plan's findings state that the prototype's maths and behaviour were translated, that nothing in
  `frontend/` or the build reads it, and that it adds nothing to the bundle. The MR repeats it.
- Sinal de alerta: a reference implementation next to the code it inspired. Say which direction the dependency
  does *not* go.

**One sentence with an "or", and only half of it delivered**

- Sintoma: the plan promised 28 % opacity for a building covering a unit *or the cell under the cursor*. The
  second half does not exist — the client has no hover to read a cell from.
- Causa real: the sentence named a capability the client does not have, and nobody checked before it was
  approved.
- Sinal de alerta: a plan clause joined by "or" where one side depends on an input mode the client lacks.

**Rough edges in the gesture module, written down instead of discovered**

- Sintoma: after a pinch, the finger that stays down cannot pan until it is lifted and pressed again; the right
  button during a pinch is read as an inspect.
- Solução: named in the MR's notes as known and untested, rather than left for a player to find.
- Sinal de alerta: a gesture that composes two others (pinch, then pan). Enumerate the transitions between them
  and test the ones that matter.

---

## O que fazer diferente

- [ ] A view transform and its inverse in one module, with a round-trip test over every cell of every real map.
- [ ] Shared data is read through the transform, never turned in place.
- [ ] When the view simplifies something the rules do not, say so in the code beside the simplification.
- [ ] Cut a large visual feature into slices that each ship and can be accepted separately.
- [ ] When a debt asks for a test of scene code, look for the pure module that removes the need for the harness.
- [ ] A prototype kept in the repository says explicitly that nothing reads it.

See also [[ea-8-sprite-target]] (which rode in this branch), [[map-zoom]] (the pan and zoom this extends) and
[[iso-board]] (the projection and picking it has to invert).
