# Index — Map fidelity: the three prototype maps, identical to the prototype

**Created on:** 2026-10-04
**Branch:** `feat/visual-identity` (same MR as the rest of the visual work, unless the owner splits it)
**Source:** `.ia_context/prototypes/eldritch-alley-map-prototype/` (`js/data.js` for the maps and palettes, `js/app.js` for the drawing)
**Supersedes:** `map-variety.index.md`. Its four milestones delivered the 10×10 layout, the four height tones and the random draw, but not the prototype's look. This plan replaces that look; the random draw and the spawn rules stay.

## Goal

The three maps of the match (`street`, `park`, `roof`) look and read like the prototype: the same tiles with the
same colours, the same heights, the same props and the same sky, drawn in the prototype's pixel-art style. The
owner's words: "o mapa do jogo tem que ser idêntico ao mapa do protótipo".

## Decisions taken by the owner

1. **Terrain lives on the client as data, and the server sends only the map id.** A copy of the map data sits on
   each side, as `protocol.ts` already does, with a test that the two copies are equal.
2. **Heights are the prototype's exact values** (0 to 11), not the four levels of `map-variety`. The engine already
   accepts any level from 0 to 255, and its step rule (|Δ| ≤ 1) stays as it is.
3. **The look is pixel art:** the scene is drawn at the prototype's resolution and scaled by a whole number.

## Decisions taken by this plan (the owner can change them before M1)

4. **Scale 2.** The prototype's tile (32×16 at its own resolution) is drawn at 2×, so a tile is 64×32 px on the canvas.
   The board is 640 px wide, the same width as before, so the HUD still floats over it without covering the play.
5. **Units keep the sprites approved in the visual identity feature.** The prototype's own 14×17 placeholder figures
   are not copied. The sprites are drawn at 2× to match the scale of the map, so their scale changes from 3 to 2.
6. **Demo-only overlays are not part of the map:** the prototype's red "threat" line, its demo units and its move and
   attack highlights. The match draws its own highlights and units on top of the map.
7. **Gaps (`v` in `roof`, height −10) are void:** no floor is drawn, and no unit can stand there or enter it, because
   the step rule refuses every climb into them.

## Milestones (frontend and backend order: data → renderer → validation)

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [map-fidelity-m1-data.plan.md](./map-fidelity-m1-data.plan.md): the map data from the prototype, the protocol carries the map id, the copies agree, the spawns stay reachable | [x] concluído | — |
| 2 | [map-fidelity-m2-renderer.plan.md](./map-fidelity-m2-renderer.plan.md): the prototype's drawing on the client, scaled 2×, with the match's units and HUD on top | [x] concluído (entregue; revisão em .ia_context/descriptions e revisão do deepseek) | — |
| 3 | [map-fidelity-m3-validation.plan.md](./map-fidelity-m3-validation.plan.md): comparison with the prototype's screenshots, the owner's approval | [ ] pendente | — |

## Dependency notes

- M2 depends on M1: the renderer reads the map data and the map id from the state.
- M3 depends on M2: the screenshots must show the finished renderer.
- The protocol version goes from 2 to 3, because the state message gains `mapId`. The client shows
  "Versão incompatível" for an old server, as it already does.
- `backend/engine/` is not changed.
- DT-48 (the wall invariants that use orthogonal adjacency) applies here too: M1 checks reachability with the
  8-neighbour rule, because the engine allows diagonal steps.
