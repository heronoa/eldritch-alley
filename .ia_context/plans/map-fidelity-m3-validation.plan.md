# Plan — Map fidelity, M3: validation by comparison with the prototype, and the owner's approval

**Milestone:** m3-validation
**Parent feature:** [map-fidelity.index.md](./map-fidelity.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Check that each of the three maps in the match looks like the prototype's map of the same name, and that the
reachability decisions of M1 are the ones the owner accepts. This milestone adds no feature. The owner
approves each map by comparing it with its screenshot.

### 2. Prerequisites

- M2 approved, with its automated checks green and each map drawing in the browser.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `.ia_context/descriptions/map-fidelity-screenshots/` | create | Screenshots of the match on each map, taken by the executor, one per map, at 1280×720 |
| `.ia_context/descriptions/map-fidelity-screenshots/README.md` | create | Which prototype screenshot each one is compared with, and the checklist of §5 |
| `backend/game-server/src/map.test.ts` | modify (only if the owner changes a `KNOWN_UNREACHABLE` entry) | The lists match the owner's decision |

No source change is expected in this milestone. A change that the comparison forces goes back to M2 as a new
item, not as a silent fix here.

### 4. How the comparison is made

For each map, the executor takes one screenshot of the match at its start, with the units in their spawns, and
places it next to the prototype's screenshot of the same map:

| Match map | Prototype screenshot | Prototype map |
|---|---|---|
| `street` | `eldritch-alley-map-prototype/screenshots/street.png` | Rua do Comércio e beco |
| `park` | `eldritch-alley-map-prototype/screenshots/park.png` | Praça Municipal nº 3 |
| `roof` | `eldritch-alley-map-prototype/screenshots/roof.png` | Edifício Central, cobertura |

The comparison is by eye, against a list. The HUD is excluded: it floats over the map by design, and the owner
compares the map under it.

### 5. Checklist, per map (the owner ticks each item)

**Ground and heights**
- [ ] Every tile has the colour of its letter: asphalt, sidewalk, alley, grass, path, plaza, water, roof slab, gravel, gap, plank.
- [ ] The heights read as the prototype's: the same blocks are tall and the same ones are low.
- [ ] The gap of `roof` is void (no floor), and the plank crosses it at its one row.

**Buildings and structures**
- [ ] The buildings have the prototype's facades and window lights.
- [ ] `roof` has its parapet, its railings and its lines and wires.
- [ ] `street` has its shop fronts and its fence.

**Props and details**
- [ ] Every prop of the prototype's map is there, at its cell, in its style (cars, lamps, trees, bushes, benches,
      fountain, bins, hydrant, AC units, antenna, satellite dish, solar panels, skylights, puddles, tape, chalk).
- [ ] The animated parts move: the lamps' light, the neon leaks, the particles.

**Sky**
- [ ] `street` and `park` have the prototype's sky; `roof` has its moon and its skyline.

**Units and play**
- [ ] The units stand on the ground, not inside a block, and a block in front of a unit hides it.
- [ ] Each team's spawns are the prototype's demo positions (ally at the bottom or left, enemy at the top or right, as in the prototype).

### 6. Reachability decisions (the owner decides)

- The `KNOWN_UNREACHABLE` lists of M1 are shown to the owner, one per map, with the reason beside each cell.
- For each listed cell the owner chooses one of three answers:
  - **A)** It stays unreachable: it is decor (a roof above the play area, for example). The list stays.
  - **B)** It becomes reachable: the height is changed in the data (a new data change, with the checksums of M1
    recomputed) and the test is updated.
  - **C)** The owner accepts the whole map as it is, with those cells as decor.
- Any change under B goes through M1's test again before the owner accepts the map.

### 7. Approval

- The owner approves each map in writing in the PR: one line per map, "approved", with the checklist ticked.
- A map that fails a checklist item goes back to M2 as a new item of the feature. The milestone does not close
  until all three maps are approved.

### 8. Acceptance

- [ ] Three screenshots and the README of §3 committed in `.ia_context/descriptions/map-fidelity-screenshots/`.
- [ ] The checklist of §5 ticked for each map by the owner.
- [ ] The decisions of §6 recorded for every listed cell.
- [ ] The owner's approval of each map recorded in the PR.
- [ ] Root `npm test` still green.

### 9. Out of scope

- New maps, new props, new animations beyond the prototype's.
- The map titles and the logs of each map (the lobby and the result screens).
- Phone layouts and the prototype's own page (its HTML, its demo panels and its sprites).
