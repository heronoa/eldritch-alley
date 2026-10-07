# Lesson — A rule the client and the server share, and line of sight in integer math

**Feature:** ea-1-line-of-sight (`ea-1-line-of-sight.plan.md`, engine + client; delivered in PR #15, branch `fix/players-feedback`)
**Date:** 2026-10-07
**Tags:** `#architecture` `#determinism` `#testing`

---

## Context

The playtest said shots passed through buildings. The engine had no sight rule at all — `validateAttack` checked
only "not dead, not an ally, distance ≤ reach" — and the client's preview had its own, different idea of what a
shot was. The risk was not the geometry: it was writing the rule twice and calling one of the two copies the
truth.

---

## Decisions worth reusing

**One rule, one implementation, and the client imports it**

- Situation: both the server's validation and the client's highlight had to answer "can this unit shoot that
  cell", and the client is a browser bundle.
- Decision taken: `hasLineOfSight` lives in `backend/engine/src/sight.ts` as a pure function; the client imports
  it through the package entry, never a copy. EA-2 and EA-5 follow the same shape with `reachableCells`,
  `findPath` and `attackArea`.
- Alternative rejected: a second implementation in `frontend/`. Two rules drift, and the playtest report was
  exactly a case of the two disagreeing with the player's eye.
- Applies when: a rule decides both a highlight and a validation. Write it in the layer that owns the truth and
  make the other one import it, rather than describing it in two places.

**A build-time guard for what the compiler cannot see**

- Situation: the engine is a leaf package with no framework and no I/O (CLAUDE.md rule 1), and it is now bundled
  into a browser.
- Decision taken: `backend/engine/src/no-node-deps.test.ts` scans every file under `engine/src` and fails on a
  `node:*` specifier or on any import from outside the engine.
- Applies when: a pure package is consumed by a browser bundle. The import that breaks the build is never the one
  written on purpose; it is the one added months later by someone who did not know the constraint existed.

**Integer-only geometry, scaled by the denominator**

- Situation: the sight line compares each intermediate cell's level with the line's height at that step — a
  ratio, and the engine is integer-only (ADR 0005).
- Decision taken: multiply both sides of the comparison by the distance `n`, so no division and no float enters
  the engine: `level(i) * n > eyeA * n + (eyeT − eyeA) * i`.
- Applies when: a ratio has to be compared in a deterministic engine. Scale both sides by the denominator
  instead of dividing.

**Symmetry is a rule, and it is tested as a sweep**

- Situation: a sight line from A to T and the one from T to A are not the same line in a raster.
- Decision taken (D2): blocked if *either* direction is blocked, with a test sweeping every pair of cells of the
  three maps rather than a handful of hand-written pairs.
- Applies when: a rule is not obviously commutative. An asymmetric sight rule is invisible in a one-direction
  test and immediately visible to a player.

---

## Armadilhas encontradas

**The bug that was reported was not the bug that existed**

- Sintoma: "the sniper cannot shoot across the rooftop gap", reported once, in the alley-and-rooftop playtest.
- Causa real: not reproduced. The engine accepted the shot; the class and the magazine were never recorded, and
  the two other refusals (empty magazine, range 1) explain the sighting. The item was closed as *not an EA-1
  bug*, with the owner re-testing in the game.
- Solução: the sniper-with-ammunition case stayed as a regression test, so the report still bought something.
- Sinal de alerta: a playtest report with no class, no resource state and no seed. Ask for those before writing
  a rule for it.

**A test whose expectation belongs to a ticket that has not landed**

- Sintoma: the sniper's empty-magazine shot refused with `target-out-of-range` (melee fallback, reach 1), while
  EA-14 was already written to make it `no-ammunition`.
- Causa real: two tickets changing the same refusal, one merged first.
- Solução: the plan wrote the case as `it.todo`, named EA-14, and enabled it when EA-14 landed. Two of those
  todos became real tests in EA-14.
- Sinal de alerta: a test asserting "the rule as it is today" when a plan already exists that changes it.

---

## O que fazer diferente

- [ ] When a playtest report is a one-off, record the class, the resource state and the seed before writing a
  rule for it — or say in the record that it was never reproduced.
- [ ] Put a shared rule behind the package entry and add the import guard in the same change.
- [ ] Scale both sides of a ratio by the common denominator instead of dividing.
- [ ] Mark a test whose expectation depends on an unlanded ticket as `it.todo` with the ticket's name.

See also [[ea-2-ea-7-movement-path]] (the same shared-rule shape for movement) and
[[ea-5-range-display]] (`attackArea`, the third function in the same family).
