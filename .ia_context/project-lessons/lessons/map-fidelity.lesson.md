# Lesson — Making the board match a reference, with terrain data on both sides of the wire

**Feature:** map-fidelity (`map-fidelity.index.md`, M1 to M3; `frontend/src/maps/`, `frontend/src/scenes/map/`, `backend/game-server/src/maps/`)
**Date:** 2026-10-05
**Tags:** `#protocol` `#architecture` `#testing`

---

## Context

The owner's requirement was that the three match maps be identical to the prototype: the same tiles, heights,
props and sky. The earlier `map-variety` feature had delivered the layout and the random draw, but not the
look. The risk was that terrain data would drift between the client and the server, and that the rules would
accept moves the picture did not show.

---

## Decisions worth reusing

**The terrain is data on both sides, and a test says the two copies agree**

- Situation: the client draws the map, and the server needs the same map to set up spawns and rules.
- Decision taken: the server sends only the map id. Each side carries a copy of the data, and a test compares
  the two copies field by field.
- Alternative rejected: sending the full terrain in every state message. The copies were already the pattern
  in `protocol.ts`, and the id is enough to pick a map.
- Applies when: the same data is needed in two packages. Send the id, keep the copies, and test that they agree.

**Protocol changes are versioned, and an old client says so**

- Situation: the state message gains the map id, so an old client would not know what to draw.
- Decision taken: the protocol version moves from 2 to 3, and the client shows "Versão incompatível" for an old
  server, as it already did.
- Applies when: a message gains a field the client needs. Bump the version, and make the mismatch visible.

**Gaps are void, and the step rule enforces it**

- Situation: the prototype has gaps in its roof, and a unit could try to walk into one.
- Decision taken: a gap is drawn as no floor, and the engine's step rule refuses every climb into it. Nothing
  special is added to the rules.
- Applies when: the picture and the rules must agree about an empty cell. Make the rule refuse it, and draw
  nothing for it.

**Demo overlays are not part of the map**

- Situation: the prototype draws a threat line, demo units and highlights on top of the map.
- Decision taken: those are left out. The match draws its own highlights and units on top.
- Applies when: a reference screenshot contains interaction that the game draws itself.

---

## Armadilhas encontradas

**Reachability was checked with the wrong neighbourhood**

- Sintoma: the plan's reachability check used orthogonal steps (DT-48), but the engine allows diagonal steps.
- Causa real: the invariant was written from the drawing, not from the engine's adjacency rule. M1 checks
  reachability with the 8-neighbour rule, because the engine uses it.
- Sinal de alerta: a graph invariant written without opening the code that moves along the graph.

**An approval checklist left unticked while the feature was approved**

- Sintoma: the M3 plan's checklist was open when the owner approved the feature. The status records the
  approval, but the items were not ticked one by one.
- Causa real: the approval was recorded as a status, not as checked items.
- Sinal de alerta: an approved status next to an open checklist. Tick the items, or write why they were not.

---

## O que fazer diferente

- [ ] Check the engine's adjacency rule before writing any reachability invariant.
- [ ] Record owner approval as ticked items with the date, not as a status alone.
- [ ] Keep the two copies of shared data and a test that compares them, from the first milestone.
