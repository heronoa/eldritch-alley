# Plan — Map variety, M4: design pass and owner approval

**Milestone:** m4-design
**Parent feature:** [map-variety.index.md](./map-variety.index.md)
**Created on:** 2026-10-04
**Status:** executed on 2026-10-04, awaiting the owner's review of section 5. No constant changed: the
screenshots justified none (section 10).

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
| `.ia_context/descriptions/iso-board-screenshots/` | create | `06-map-street.png`, `07-map-park.png`, `08-map-roof.png`, and `09-maps-vs-prototype.png` (section 10) |

No row was used: none of the three tones a screenshot could have asked for is the one the screenshots ask
for, so the milestone ships screenshots and no code (section 10).

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

The automated half is green on 2026-10-04: engine 122/122, game-server 45/45 (Node 22), frontend 211/211,
`tsc --noEmit` clean, `npm run build -w @eldritch-alley/frontend` clean. The four screenshots are stored
and `09-maps-vs-prototype.png` puts each map next to its prototype in one sheet, which is the material the
owner's list above is ticked against. Item 4's check is not only visual: `map.test.ts` asserts the plank is
the gap column's only level-2 cell, and the captured roof board matched that literal cell for cell.

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

- [x] Automated checks pass. Engine 122/122, game-server 45/45, frontend 211/211, `tsc --noEmit` and the
      build clean, `backend/engine/` untouched.
- [ ] The manual list is ticked by the owner, with the screenshots in the PR. Awaiting him; the four
      screenshots are already in `.ia_context/descriptions/iso-board-screenshots/`.
- [x] `backend/` is unchanged by this milestone. The whole milestone is four PNG files: `git status
      --porcelain` lists them and nothing else.

### 9. Out of scope

- DT-44, the attack effects drawn beneath the board. **This line was already stale when the milestone ran:**
  DT-44 was closed by `EFFECT_DEPTH = 20` in the isometric feature, so effects no longer sit under the
  board. The screenshots here are of a match's first frame anyway, which has no effect in it.
- Props, and fading tiles that cover a unit (a known limit from the isometric index).
- Any change to the maps' content: this milestone tunes how they are drawn, not what they are.

---

### 10. Divergences in the execution (2026-10-04)

**No constant changed.** The three levers of section 3 were each measured rather than eyeballed, and each
measurement says the current value is the one to keep:

- **`TOP_Y`.** `boardBounds({width: 10, height: 10})` is `{x: 320, y: 152, width: 640, height: 416}`.
  `PANEL_RECT` ends at 316 and `LOG_RECT` starts at 964, so the board clears each column by **4 px**: no
  overlap and no clipped corner. The fallback of section 4.1's risk list (`TILE_W 60`) is not needed.
- **`BODY_SCALE`.** A 16×24 frame at 3 is 48×72 against a 64×32 tile, so a body is 0.75 of a tile's width
  and a quarter larger than it was on an 80×40 tile — the premise of section 4.3 is right. It does not
  overfill: the sprites of two diagonal neighbours overlap by 16 px, as they already did by 8 px at the old
  tile size, and 2 would make a unit 32×48, shorter than a three-level wall block (48 px) and smaller than
  the sprite the owner approved. Kept, and put to the owner rather than changed.
- **The level-3 wall tone — the plan's own remedy was measured and rejected.** Section 4.2 pre-authorises
  lightening the wall towards `#3a3f52` if a wall does not separate from the street. Measured on the
  rendered frames, a wall top (`#1a1e2c`) against the road (`#23283a`) is **1.13:1**. But the palette is
  pinned from both ends: `theme.contrast.test.ts` keeps the paper marker at 7:1 over every top, which caps
  a top at luminance 0.0691, and the same file requires the wall to stay darker than `heightColor(2)`,
  which is the ceiling of the walkable ramp. Scanning the whole dark band for the tone whose *worst* pair
  against the road, the walkable ground, the raised ground and the night is largest gives a ceiling of
  **1.148:1** — and the tone already in use is at **98.8% of it**. `#3a3f52` is worse than what it would
  replace: it trades the road pair (1.13:1 → 1.40:1) for a collision with level 2 at **1.04:1**, which on
  the park would make its hill and its border buildings the same tone — the hill being the map's contested
  high ground. No tone lighter than level 0 and darker than level 2 is free, because level 1
  (`#30364a`) sits in that band. The wall reading weakly against the road is a property of the four-tone
  palette under the 7:1 floor, not of this milestone's constants; the real levers (lit windows, curb and
  road markings, a relaxed outline floor) are out of scope by section 9 and by the isometric index.

**Section 4.4's live check found a real defect, and it is not this milestone's to fix.** Two of its three
cases hold. A wall's *top face* resolves to the wall, and a flat cell behind a tall block resolves to
itself when the click lands on the part of it that is drawn. A tall block's **side face does not**: on the
street map the pixel at (592, 320) is painted `#0f121c`, the right face of the wall at (3, 5), and
`cellAt` answers **(3, 4)**, a level-0 road cell hidden behind that wall. The cause is in `cellAt`'s own
rule (`iso.ts`): it tests *every* top face before *any* block, so a top face that a nearer block has
painted over still wins. `iso.test.ts` already knows the hole — the side-face test at line 128 says its
point was chosen "low enough that no flat top face behind the block reaches it" — so the tests route
around it rather than pin it. It is pre-existing, not introduced by the maps, but the maps are what make
it reachable in play: the old 8×8 board had one two-level block, while the street map is 51 wall cells
whose faces front onto flat ground, and a click on one of those faces can order a move to a cell the
player cannot see. It needs its own change (`cellAt` walking front to back and counting a block's side
face only where the block stands above the neighbour it faces, plus the tests that pin the four cases
already in `iso.test.ts`), which is beyond section 3's "`TOP_Y`, and nothing else". Reported to the owner
rather than folded in.

**The roof's arrival cell loses its centre pixel to the raised plate, and that is correct.** Cell (1, 0)
is flat on the roof while (2, 1) is two levels up; two levels is 32 px and two steps along the diagonal is
32 px, so the raised cell's top face lands exactly on the flat cell's centre. `cellAt(672, 216)` answers
(2, 1), and (672, 224) does too; (672, 208) and (672, 200) answer (1, 0). That matches what is drawn — the
pixel really is the plate's corner — so it is the documented rule working, not a defect. It is recorded
because it is what made the first harness run report `scene selected: A-wizard — MISMATCH` on the roof:
the first capture ran at a window scale of 0.878, where the dispatched integer device pixel mapped back to
672.6 and missed the tie, and only the native-resolution recapture hit it. A click on the *body* of the
unit resolves to the unit; only the exact centre and the half of the cell in front of it belong to the
plate.

**The screenshots are 1280×720 at one device pixel per canvas pixel.** The capture forces
`Emulation.setDeviceMetricsOverride`, so the tones in them are the tones the palette declares and the
crops need no rescaling. They were classified cell by cell against the three literals `map.ts` ships:
100 of 100 cells agree, except where a raised neighbour legitimately paints over a floor cell (17 on the
roof, 9 on the street, 0 on the park) or a unit sprite stands on the cell (the six spawn cells). No
z-fighting and no unexpected tone appeared anywhere.

**`09-maps-vs-prototype.png` is an addition to section 3's file list.** Section 5 asks for the screenshots
"in the PR, next to the prototype's", and the three prototype frames live in a different directory, so a
single sheet with each map above its prototype is what the owner actually reviews. The three named
screenshots are stored exactly as section 3 asks.

**The seed's map is not what section 4.1 of the parent plan predicted for the default.** `MATCH_SEED = 1`
still builds `park` (index 1); the live game draws its own seed, which is why the capture needed six
attempts to see all three maps (`roof park roof roof park street`).
