# Plan — Map variety, M4: design pass and owner approval

**Milestone:** m4-design
**Parent feature:** [map-variety.index.md](./map-variety.index.md)
**Created on:** 2026-10-04
**Status:** pendente

---

### 1. Objective

Look at the three maps on the real board and fix what the screenshots show. This is the milestone the owner
reviews, in the same way M3 of the isometric board was reviewed: screenshots attached to the PR, compared
with `.ia_context/prototypes/eldritch-alley-map-prototype/screenshots/`.

### 2. Prerequisites

- M3 merged, so the server really sends the three maps.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/iso.ts` | modify only if a screenshot asks for it | `TOP_Y` (vertical centring), and nothing else |
| `frontend/src/view/theme.ts` | modify only if a screenshot asks for it | The level-3 wall tone (section 4.2) |
| `frontend/src/scenes/units.ts` | modify only if a screenshot asks for it | `BODY_SCALE` (section 4.3) |
| `frontend/src/view/*.test.ts` | modify with the value it guards | Only the expectations that name a changed constant |
| `.ia_context/descriptions/iso-board-screenshots/` | create | `06-map-street.png`, `07-map-park.png`, `08-map-roof.png` |

### 4. Contracts

#### 4.1 What is being judged

- Three maps, three looks: a flat street hemmed by walls; a park with a pond, a plateau and a walled border;
  a rooftop cut by a chasm with one plank across it.
- The board at 10×10 fills the gap between the panels without colliding with either column.
- The blocks read as places: the wall tone separates from the ground tone, the height of a wall is legible,
  and the 3-level faces do not shimmer or z-fight.

#### 4.2 The wall tone

`#1a1e2c` (the prototype's `B`) against level 0's `#23283a`. The two are close in value, which is deliberate —
the prototype's buildings are dark — so the test to apply is the screenshot's, not a ratio: if a wall does not
separate from the street it stands on, the wall tone is lightened towards the prototype's `x` (`#3a3f52`), and
`theme.contrast.test.ts` keeps its 7:1 floor for the paper marker over it either way.

#### 4.3 Sprite scale

`BODY_SCALE = 3` was chosen for an 80×40 tile. A 64×32 tile makes the same 48×72 sprite a quarter larger
relative to the board. Reduce to 2 only if the screenshots show a unit overfilling its cell; any change comes
with the test that pins it.

#### 4.4 Picking at 10×10

A click on a wall's top face, on a tall block's side face, and on a flat cell behind a tall block must all
resolve to the cell under the pointer, exactly as M1's tests assert at the arithmetic level. The live check is
what confirms the scene wires them to the same size.

### 5. Tests planned

No new automated tests: M1's cover the geometry, M3's cover the content. The frontend suite must stay green.

**Manual (owner, screenshots in the PR, next to the prototype's `street.png`, `park.png` and `roof.png`):**
- [ ] Each of the three maps is recognisable as its prototype counterpart.
- [ ] The 10×10 board sits between the panels with no overlap and no clipped corner.
- [ ] A unit standing on a wall's top face is not required for the board to read; walls read as buildings.
- [ ] The plank over the gap reads as the only crossing on the roof map.
- [ ] The owner records approval of the map variety in the PR, or lists what to change.

### 6. Dependencies

- M3 merged. Nothing downstream.

### 7. Execution steps

1. Build and serve the client, start the game server, and play matches with the M3 harness
   (`/tmp/ea-m3.scene.mjs` reads the live state, so it can classify each board by its level histogram).
2. Screenshot the three maps, at the start of a match, and add them to
   `.ia_context/descriptions/iso-board-screenshots/`.
3. Change only the constants a screenshot justifies, with their tests.
4. Re-run the frontend suite, `tsc --noEmit` and the build.
5. Attach the screenshots to the PR with the prototype's next to them.

### 8. Acceptance

- [ ] Automated checks pass.
- [ ] The manual list is ticked by the owner, with the screenshots in the PR.
- [ ] `backend/` is unchanged by this milestone.

### 9. Out of scope

- DT-44, the attack effects drawn beneath the board — still open, and still why no screenshot shows an attack.
- Props, and fading tiles that cover a unit (a known limit from the isometric index).
- Any change to the maps' content: this milestone tunes how they are drawn, not what they are.
