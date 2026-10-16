# Lesson — Recording game rules as decisions before any code, and what a late scope change costs

**Feature:** debt-and-reaction-rules (`debt-and-reaction-rules.plan.md`; ADR 0007; pitch sections)
**Date:** 2026-10-05
**Tags:** `#architecture` `#process` `#types`

---

## Context

Two game rules were fixed before the milestone that implements them: reaction abilities (an ability that
triggers during another unit's action) and two-step resurrection. The plan also fixed a set of technical
debts. The risk was that rules written as prose would be re-decided later, and that a rule change would
reach the approved engine without a plan.

---

## Decisions worth reusing

**Each decision records where it came from**

- Situation: a plan mixes the owner's spec, the owner's answers and the plan's own choices.
- Decision taken: the plan's decision table has a "Source" column: owner's spec, answer, or plan decision.
  Items the plan chose and the owner has not confirmed are labelled "to confirm".
- Applies when: a plan is written from a conversation. The reader must know which decisions are settled.

**Tunable numbers are data, not code**

- Situation: reaction slots depend on Nerve, and the owner expects to rebalance them.
- Decision taken: the slot bands and the corpse durations are tables (Nerve 0–24 → 3 slots, and so on).
  Balancing changes the table, not the engine.
- Applies when: a rule has thresholds that will change. Keep the thresholds in one table, typed by the code
  that reads it.

**A scope change to an approved milestone is written as a decision**

- Situation: the owner moved the corpse rule into the M1 engine, which had already been approved.
- Decision taken: the plan records the change, its reason, and that it happens before M2 depends on the
  engine. It is not treated as a new feature.
- Applies when: a later rule touches an earlier, approved layer. Name the layer that changes, and why now.

**Dependency upgrades stop short of a major version**

- Situation: `npm audit` reports advisories, and the fix may be a breaking upgrade.
- Decision taken: `npm audit fix` without `--force`. Only fixes that stay within a major version.
- Applies when: a security advisory meets a project that is still early. Take the safe fixes now, and track
  the major upgrades as debt.

---

## Armadilhas encontradas

**A decision marked "to confirm" with no record that it was confirmed**

- Sintoma: the round definition is marked "Plan decision, to confirm". The plan was closed without a record
  that the owner confirmed it.
- Causa real: the confirmation step was not written as a checklist item.
- Sinal de alerta: any "to confirm" label in a plan that is marked applied. Resolve it or move it to the
  debt file.

**A plan that calls itself documentation can still change the engine**

- Sintoma: the plan header reads "documentation, one engine change, lockfile", so the engine change is named
  in its first line, but the milestone list does not separate it from the docs.
- Causa real: the engine change was folded into a plan whose main deliverable is text.
- Sinal de alerta: a plan whose header lists a code change that its milestones do not track.

---

## O que fazer diferente

- [ ] Turn every "to confirm" decision into a checklist item before the plan is marked applied.
- [ ] When a rule changes an approved layer, add the change to the file list and to the scope section.
- [ ] Keep thresholds in data tables from the first commit.
