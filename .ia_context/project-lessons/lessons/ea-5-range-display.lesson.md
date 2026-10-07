# Lesson — One area at a time: a pending move, an undo that refunds, and the chips that went missing

**Feature:** ea-5-range-display (`ea-5-range-display.plan.md`, engine + protocol + client; delivered in PR #15, branch `fix/players-feedback`, revised 2026-10-06)
**Date:** 2026-10-07
**Tags:** `#architecture` `#determinism` `#process`

---

## Context

The board painted the movement area and the attack area together, so the player could not tell which question the
game was asking. The ticket's answer was a rule about what the board shows — and it forced a new concept into the
engine: a move that is placed but not yet committed, with an undo that gives back what it spent.

---

## Decisions worth reusing

**One area per state, and the state decides**

- Situation: two derived sets (reachable cells, attack area) were painted at once, which is the anticipation the
  ticket exists to remove.
- Decision taken (D1): the board shows the area of the question the turn is asking — reachable cells while
  choosing a destination, `attackArea` from the current cell while a move is pending or the attack is armed.
  Never both.
- Applies when: a board shows more than one derived set. The player answers one question at a time.

**A layer that exists only to serve a layer you just dropped gets deleted, not postponed**

- Situation: the first revision had a third layer, `threatArea` — the union of `attackArea` over the reachable
  cells — which needed a third tone and a toggle, both of which existed only to serve it. EA-6 had planned
  around it too.
- Decision taken (D2): removed from the plan, from `src/attack.ts` and from EA-6's plan, with the reason written
  down. Explicitly "not kept for later: if a future ticket needs it, it is written then, with its own
  justification."
- Applies when: a feature's only justification was another feature that was just cut.

**A move is a run with an origin and a cost, and cancelling refunds what it spent**

- Situation: a move had to be undoable until something else happened, without snapshotting the turn.
- Decision taken (D3, D5): `MatchState.pendingMove = { from, cost } | null`; `move` opens or extends a run; the
  refund is *proportional* — a run that spent half gives half back, not a reset to the full budget.
- Applies when: an undo is offered. Store the origin and what was spent; do not keep a copy of everything.

**The commit lives in the function the replay also calls**

- Situation: "what ends a run" had to be identical in a live match and in a replay.
- Decision taken: it lives in `applyEvent` — an event that is not `moved` closes the run, so a replayed turn
  rebuilds the same state and the same hash. A test pins the replay case (a run, a cancel, a commit).
- Applies when: state can change from more than one entry point. Put the transition where the replay also passes.

**The bot never cancels and never confirms**

- Situation (D7): two new actions that a human sends, in a room that also plays a bot.
- Decision taken: the bot sends neither; its run is closed by the next action it was going to play anyway. Both
  chips are human-only, and a test asserts the bot never sends them.
- Applies when: adding an interactive control. Say explicitly what the AI does with it — silence here is a
  hang waiting to happen.

---

## Armadilhas encontradas

**A serious bug the owner found, that reading the code could not reproduce**

- Sintoma: DT-81 — after a move that spent the *whole* budget the two Confirm/Cancel chips did not appear, so the
  move looked committed and could not be cancelled. A partial spend showed them.
- Causa real: never established by reading. The engine and the client state were provably right (a temporary
  test moved a unit with 3 points over 3 cells: `movementLeft` 0, `pendingMove` set, `moveChips` returning 2);
  the scene's half was then pinned by a test; what remained was `HudScene.drawMoveChips` or what the server
  sends, and the debt record says neither could be settled without a browser run.
- Solução: the plan's slice F required a browser run to find the cause, and the plan itself says to stop and
  report when the browser cannot run — it could not. The debt stayed **open and narrowed** across two more
  branches, blocking EA-5's acceptance. It is resolved now: the chip model is derived from `state.pendingMove`
  alone (`moveChips` in `frontend/src/game/actions.ts`) and never from the armed mode, so the fallback of the
  mode to `inspect` on a full spend cannot drop them, and the chip rectangle is anchored above the dashboard
  (`frontend/src/view/layout.ts`).
- Sinal de alerta: a UI defect whose *model* is provably correct and whose *pixels* are wrong. More reading will
  not settle it — and a debt that says "needs the browser" blocks every feature that touches the same screen
  until somebody runs one.

**A divergence between two plans that the code had to settle**

- Sintoma: EA-5's D1 said the board shows `attackArea` from the current cell while a move is pending; the code
  shows the movement area the run has just spent, and the attack area only once `Atacar` is armed.
- Causa real: the rule was decided before the interaction that implements it, and the interaction changed.
- Solução: named in the MR's divergence list, with the code comment and the plan disagreeing, as the one item
  the reviewer was asked to settle first.
- Sinal de alerta: two documents stating different rules for the same pixel, with no test between them.

**A plan's status is not the feature's status**

- Sintoma: EA-5's plan still reads "ready for review" while its code had been in `develop` for two branches.
- Causa real: nobody updates the status line, and nothing checks it.
- Sinal de alerta: reaching for a plan to learn what a feature does, months after it merged. The MR description
  is the accurate record; the plan is a design intent.

---

## O que fazer diferente

- [ ] A control only a human sends: write down what the AI does with it, in the same change.
- [ ] When a debt says it needs a browser run, run it. A narrowed debt blocks the next feature on the same
  screen, and the code will not tell you the answer.
- [ ] When a derived set is superseded, delete it from every plan that named it and say so in the revision note.
- [ ] An undo stores the origin and the cost, not a snapshot of the state.
- [ ] Put a state transition where the replay also passes, so live and replay cannot diverge.

See also [[smoke-test-2-feedback]] (where DT-81 was narrowed and the chips were finally fixed),
[[ea-6-enemy-ranges]] (the feature that had to drop `threatArea` with this plan) and
[[debt-and-reaction-rules]] (why the reaction rule for a commit was written down but not implemented).
