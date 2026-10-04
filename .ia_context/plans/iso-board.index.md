# Index — Isometric board with an overlaid HUD (path 2)

**Created on:** 2026-10-04
**Branch:** `feat/visual-identity` (this plan ships in the same branch and the same MR as the visual identity feature)
**Source:** `.ia_context/prototypes/eldritch-alley-map-prototype/` (projection and palette), `eldritch-alley-characters-v1/` (sprites, already in use)

## Goal

Make the match look like the prototype: an isometric 8×8 board with three height levels, drawn as
blocks, with the units standing on it, and the HUD (carousel, action bar, unit panel, log, legend)
floating over the board instead of sitting beside it. The engine, the server and the protocol do not
change. The sprites and animations delivered by the visual identity feature stay as they are.

## Decisions taken by this plan

The owner chose path 2 explicitly. The values below are the plan's choices; the owner can change them
before M1 is approved.

1. **Projection** (prototype's): tile width `TILE_W = 80`, tile height `TILE_H = 40`, height step
   `HZ = 20` px per level. Board top vertex at `TOP_Y = 200`, horizontal centre `CX = 640`.
2. **Sprite scale** `BODY_SCALE = 3` (16×24 becomes 48×72), so a unit reads against an 80 px tile.
3. **Clicks:** the HUD is tested first, then the board. Any point inside a HUD rectangle is consumed,
   even if no button is there. The board is picked by the front-most block that contains the point.
4. **Occlusion:** natural, by depth order (`x + y`). No fading of tiles that cover units in this feature.
   The prototype's README lists this as an open rule; it is a known limit, not a bug.
5. **HUD positions:** unit panel left (x 16, w 300), log right (x 964, w 300), carousel top, action bar
   bottom, legend and status bottom-left. All panels use the prototype's panel alpha `0.94`.
6. **Remove the flat helpers** `cellToPixel` and `pixelToCell` from `grid.ts`. The board is drawn and
   picked by `view/iso.ts` only. Heights keep their colours in `grid.ts`.
7. **Board size** on the canvas: 640 px wide, 360 px tall including the highest block. It fits between
   the carousel (y 16–96) and the action bar (y 648–704) with no overlap.

## Milestones (frontend order: logic → integration → design)

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [iso-board-m1-logic.plan.md](./iso-board-m1-logic.plan.md): projection, picking, depth, shading, overlay layout (no Phaser) | [x] concluído, aguardando revisão | — |
| 2 | [iso-board-m2-integration.plan.md](./iso-board-m2-integration.plan.md): blocks, units on the board, highlights, overlay HUD, click routing | [x] concluído, aguardando revisão | — |
| 3 | [iso-board-m3-design.plan.md](./iso-board-m3-design.plan.md): the prototype's look on blocks and overlay panels, contrast over the board, owner approval by screenshot | [x] concluído, aguardando revisão | — |

## Dependency notes

- No prerequisite branch. This plan changes `units.ts`, `effects.ts` and `MatchScene.ts` as the visual
  identity feature leaves them, in the same branch.
- M2 depends on M1 approved. M3 depends on M2 approved, because the screenshots must show the blocks
  and the overlay together.
- The title screen feature is independent of this one. Later, the title can import the same projection
  constants so the two screens share one projection.
- `backend/` does not change. No protocol change, no `PROTOCOL_VERSION` bump.
