# Lesson — Three maps drawn at random per match, and a milestone that met its checklist but not the owner's reference

**Feature:** map-variety (`map-variety.index.md`, M1 to M4; server `backend/game-server/src/maps/`, client `frontend/src/maps/`)
**Date:** 2026-10-05
**Tags:** `#determinism` `#protocol` `#process`

---

## Context

The match board was a blank plate. The goal was that the server picks one of three maps for each match, and
the client draws whatever board the state carries, instead of a hard-coded 8×8. Its look was later replaced
by the one in `map-fidelity`. The lessons below are about how the feature was defined, not about the code
that survived.

---

## Decisions worth reusing

**The server chooses the map and the client draws it**

- Situation: the client and the server both carry map data, and the choice of map is a match fact.
- Decision taken: the match's map is drawn by the server at setup, and the state carries the board. The
  client reads the board's size from the state and no longer uses constants.
- Applies when: a choice that changes the rules or the layout must be the same for every player in a match.

**The per-match draw is seeded, not free**

- Situation: a random choice that cannot be replayed would break the engine's replay guarantee (ADR 0005).
- Decision taken: the draw uses the match's seed, so the same setup gives the same map.
- Applies when: any randomness in setup. Route it through the same seed as the rest of the match.

**Fix the flaky test suite before adding a feature that depends on it**

- Situation: the server suite did not run reliably, and the map feature needed it to protect the spawns.
- Decision taken: the M3 plan put DT-32 first, so the new tests ran against a suite that was made to run.
- Applies when: a feature's acceptance depends on tests that are not yet trusted. Fix the tests first.

---

## Armadilhas encontradas

**A milestone can meet its own checklist and still miss the owner's reference**

- Sintoma: M1 to M3 were concluded and their checklists were ticked. The owner then found that the four-tone
  maps did not look like the prototype, and the feature was replaced by `map-fidelity`.
- Causa real: the feature's acceptance, as written in its index, is "the board has three maps and a random
  draw". The prototype is cited as a source, but "the maps match the prototype" is not an acceptance item.
- Solução: `map-fidelity` restates the goal as the owner's own words, "o mapa do jogo tem que ser idêntico ao
  mapa do protótipo", and makes the prototype the acceptance reference.
- Sinal de alerta: a feature whose definition of done is a list of its own deliverables, with no reference to
  the source the owner gave.

**A design pass by screenshot was counted as a milestone of its own**

- Sintoma: M4 was "executado, aguardando o dono" for a look that was later replaced.
- Causa real: the design approval was attached to a visual that was still being decided.
- Sinal de alerta: an approval item scheduled before the visual it approves has settled.

---

## O que fazer diferente

- [ ] Write the owner's reference into the feature's goal, and make the acceptance point at it.
- [ ] Do not schedule a design approval before the design it approves is final.
- [ ] Seeded randomness in setup from the first commit, even when the feature is a prototype.
