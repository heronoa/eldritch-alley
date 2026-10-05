# Lesson — Quick wins on the technical debt: small fixes that cost the most when left open

**Feature:** debt-quick-wins (`debt-quick-wins.index.md`, M1 backend and M2 client)
**Date:** 2026-10-05
**Tags:** `#testing` `#process` `#protocol`

---

## Context

The technical debt list had a set of small items: a test suite that did not start, a timing-sensitive test, an
unchecked server payload, and visible defects on the client. Each was cheap to fix, and each was expensive to
leave open, because the tests that should have caught the others did not run.

---

## Decisions worth reusing

**Selection criteria written next to the list, with the exclusions and their reasons**

- Situation: a debt list is long, and "quick" is easy to claim for items that are not.
- Decision taken: a debt is picked only if it has effort P and either blocks a user path, leaves a suite that
  does not run or does not protect, or is a visible defect. Every excluded item has a row with the reason.
- Applies when: any backlog of small items. The exclusions are the part a reviewer needs.

**Quick wins are split by layer, and each milestone stands alone**

- Situation: the backend fixes and the client fixes touch different files and have different reviewers.
- Decision taken: M1 is backend only, M2 is client only, and neither depends on the other.
- Applies when: a batch of fixes spans layers. Split them so each review stays small.

**A time-based test gets an explicit budget and is checked under load**

- Situation: a property test ran in 4.4 seconds alone and 6.1 seconds in the parallel suite, over the 5-second
  default. It failed on a loaded machine for a reason that had nothing to do with the change.
- Decision taken: an explicit 30-second timeout. The owner checked the suite under load several times, with the
  machine busy, and it passed.
- Applies when: a test depends on wall-clock time. Set the budget on purpose, and check it on a busy machine.

---

## Armadilhas encontradas

**A suite that did not start, so none of its tests ran**

- Sintoma: the game-server suite did not start, and none of the `battle-room` tests were running.
- Causa real: the suite's setup broke, and nobody noticed because the other suites were green.
- Solução: DT-32 fixed the setup first, so the server suite ran again.
- Sinal de alerta: a suite whose test count drops to zero, or a file that is listed but never reports.

**A partial closure left its remainder open for a later change to close**

- Sintoma: DT-47 was closed in part by a constant test in M2. Its scene-level part stayed open.
- Causa real: the scene part needed a test harness that the project does not have (DT-41).
- Solução: the scene part was closed later, by moving the depth values into one table with tests in Node. A
  scene-level test was not written.
- Sinal de alerta: a "partial" note that names a test the project cannot run. Look for a design change that
  makes the test unnecessary.

**An item closed in the debt file while its plan still said pending**

- Sintoma: the quick-wins index and the milestone plans said "pendente" after their debts were already closed.
- Causa real: the debt file was updated per item, and the plans and index were not.
- Sinal de alerta: a debt marked closed in the debt file that a plan still lists as open.

---

## O que fazer diferente

- [ ] Write the exclusion list with its reasons in the first version of a quick-win plan.
- [ ] Before trusting a green run, check that each test file reports a non-zero count.
- [ ] For a partial closure, name the design change that would close the rest, not only the test that is missing.
- [ ] When a debt closes, update the status of the plan that lists it in the same change.
