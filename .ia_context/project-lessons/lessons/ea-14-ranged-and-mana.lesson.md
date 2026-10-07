# Lesson — A second resource without a second mechanism, and a refusal that answers first

**Feature:** ea-14-ranged-and-mana (`ea-14-ranged-and-mana.plan.md`, engine + server + client; delivered in PR #17, branch `feat/ranged-caster`; accepts ADR 0011; closes DT-57 and DT-80)
**Date:** 2026-10-07
**Tags:** `#architecture` `#types` `#protocol`

---

## Context

Only the Sniper could shoot. Wizard and Priest had `range: 1` and no pool, and an empty magazine silently turned
a shot into an adjacent blow at half damage. The ticket gave every class one basic attack at any distance,
refused when its pool is empty, with meditation as the refill. The risk was inventing a parallel resource system
for magic.

---

## Decisions worth reusing

**Mana rides the magazine the game already had**

- Situation: a magic class needed a pool, a refill and a refusal, and the engine already had exactly those for
  ammunition.
- Decision taken (ADR 0011): a magic class gets `magazine: 3` and a `resourceKind: 'mana'`, and every rule that
  read "has rounds" reads the same two fields for both kinds. Only the *kind* decides the word and the colour.
- Alternative rejected: a second pool with its own rules, refills and refusals.
- Applies when: a new resource behaves like an existing one. Add a kind field to the mechanism before writing a
  parallel one — it is what kept this change small (the refusals, the pip count, the replay and the bot all read
  `magazine`/`ammo` and only the kind branches).

**Optional on the setup type, total on the state type**

- Situation: `Unit` and `UnitState` are built by every test fixture and every board in the project.
- Decision taken: `Unit.resourceKind` is optional (`magazine === null ? null : (unit.resourceKind ?? 'ammo')`,
  resolved in `newMatch`), so a setup that omits it means ammunition and every existing fixture compiles;
  `UnitState.resourceKind` is required and null for a class with no pool, so the rendering and the log are total.
- Applies when: a field is added to a widely-built type. Optional on the input with a documented default, total
  on the state.

**The event says what was spent, not what the unit had**

- Situation: `attacked` carried `ammoSpent: boolean`, so a replay had to infer the pool from the unit.
- Decision taken: `attacked.resource: ResourceKind | null` (and `reloaded.resource`), and `applyEvent` spends a
  round when `event.resource !== null`. This is what makes a replay land on the same state as the live match.
- Applies when: an event's meaning depends on something that can change after the event. Put it in the event.

**The pool is answered before the reach and before the sight**

- Situation: a unit can be out of pool, out of range and out of sight at the same time.
- Decision taken: `resourceRefusal(unit)` is checked first, so an empty pool masks `target-out-of-range` and
  `no-line-of-sight`. Deliberate, mirrored in the client, and flagged in the MR as the thing to change in both
  copies if it is ever questioned.
- Applies when: several refusals apply at once. The order is a decision — write it down, and mirror it from one
  function.

**The code keeps `mana`, the screen says energy**

- Situation: ADR 0011 and the plan fixed the copy as "sem mana, medite". The owner renamed the player-facing word
  to **energy** on 2026-10-06, after the mechanism was built.
- Decision taken: the identifier stays `'mana'` (the kind, `no-mana`, the ADR) and the copy says *"Sem energia,
  medite"*, `Energia`, `Energy`. Recorded in ADR 0011's consequences, not silently renamed.
- Applies when: a name is decided after the code exists. Separate the identifier from the copy, and write the
  asymmetry in the ADR, or the next reader will read it as a half-finished rename.

---

## Armadilhas encontradas

**A changed expectation is the behaviour change written down**

- Sintoma: the empty-magazine shot moved from `target-out-of-range` to `no-ammunition`, and two `it.todo` cases
  that EA-1 had parked became real tests.
- Causa real: the refusal order changed, so the sentence the player reads changed.
- Solução: the expectations moved with the rule, in `actions.test.ts`, `ammo.test.ts`, the game-server suite and
  every `UnitState` fixture. The engine suite now has no pending case.
- Sinal de alerta: an `it.todo` with a ticket name is a promise with a date on it. A suite with zero pending
  cases is a suite with no outstanding promises — count them.

**A mirrored rule is a rule with two homes**

- Sintoma: "cannot pay" is written twice on purpose (engine `actions.ts`, client `selection.ts`), and the *kind*
  branch is written again in the panel, the sheet, the log and the pips.
- Causa real: EA-1's D1 mirror (the client shows what the server would decide) extended to the new reasons.
- Solução: accepted, and counted in the MR — "four small expressions over one field, not four rules".
- Sinal de alerta: a mirrored function gaining a branch. Count the copies while the change is small.

**The plan's first guess reaches `main` as a decision**

- Sintoma: Wizard range 3, Priest range 2 and a capacity of 3 were the plan's "proposed" values, never played
  against a human, and they shipped.
- Causa real: a plan's recommended option is read as decided the moment the code implements it.
- Sinal de alerta: a "proposed, not confirmed" in a plan whose code is merged. Either confirm it or say in the
  description that it is the first guess and which ticket tunes it.

**A plan's file list that the implementation had to leave**

- Sintoma: the plan did not list `game/panel.ts` or `game/inspect-window.ts`; both changed as a consequence of
  ADR 0011 (one resource row keyed by kind replaced an ammunition row plus a dimmed mana placeholder; `PanelKey`
  went from six rows to five).
- Solução: named in the MR's divergence list.
- Sinal de alerta: a mechanism change (a type gains a kind) whose plan lists only the files that read the rule,
  not the ones that render it.

---

## O que fazer diferente

- [ ] Before a second resource, ask whether a kind field on the first one is enough.
- [ ] A field added to a widely-built type is optional on the input and total on the state.
- [ ] An event says what was spent, not what the unit had, so a replay does not have to infer it.
- [ ] When the copy is decided after the code, record the asymmetry in the ADR's consequences.
- [ ] Mirror a rule in the client from the same function, and count the copies when it gains a branch.
- [ ] Close the debts the change resolves in the same branch — this one left DT-57 and DT-80 open in the bank
  while its own code closed them.

See also [[ea-1-line-of-sight]] (the mirror rule the refusals follow) and [[ea-5-range-display]] (`attackArea`,
which deliberately ignores the pool so the highlight does not shrink when the pool is empty).
