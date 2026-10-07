# Lesson — Ending the turn for the player: a client countdown, an engine answer, and a round on the wire

**Feature:** ea-4-auto-end-turn (`ea-4-auto-end-turn.plan.md`, engine + client; delivered in PR #15, branch `fix/players-feedback`)
**Date:** 2026-10-07
**Tags:** `#protocol` `#testing` `#process`

---

## Context

Players did not know they had to press "End turn", so their units sat still until they gave up. The client would
end the turn for them after a 2 s countdown, with a link to turn the setting off. The risk was a client that ends
a turn the server never agreed to end: a late or duplicated message landing on the *next* unit's turn.

---

## Decisions worth reusing

**The engine answers the question; the client owns the nudge**

- Situation: "can this unit still do anything?" is a rule; "should we prompt the player?" is presentation.
- Decision taken: `canStillAct(state)` is exported by the engine (reachable cell, target in reach *and* sight,
  or a legal reload) and the countdown, the setting and the message are the client's. The engine never ends a
  turn by itself.
- Alternative rejected (D1): a server-side turn timer. It would put a clock outside the engine and make the room
  no longer a pure function of its messages.
- Applies when: the player needs a nudge that is not a rule. Keep the rule in the engine; keep the nudge in the
  client.

**The message names the turn it was computed from**

- Situation: a countdown that fires 2 s later can arrive after the state it was based on is gone.
- Decision taken: `endTurn { actor, round }`; a message whose round differs from the match's is refused with
  `stale-turn`, checked after `not-your-turn`. Without this the late message ends the *next* turn when the same
  unit is up again.
- Applies when: a client may send something late. Make the message name the state it was computed from, and
  refuse it when that state has moved on.

**A countdown is a state machine with the clock outside it**

- Situation: a timed behaviour that must be tested, and a scene that owns the only clock.
- Decision taken: `frontend/src/game/autoEndTurn.ts`, `idle → counting(2 s) → sent`, with `cancel`, `disable`
  and `settingChanged`; elapsed time is passed in, so a test drives it without waiting.
- Applies when: any timed client behaviour. Pass the time in; never read the clock in the rules.

**A refusal must hand the turn back**

- Situation (DT-75): the server refuses the `endTurn`, and the machine was left in `sent` — the countdown stuck,
  the button silent, the turn open with no way to see why.
- Decision taken: an explicit `rejected` event moves the machine from `sent` to `hinting`, so the hint appears on
  the button and no second `endTurn` goes out on its own. Refusals in other phases change nothing.
- Applies when: a state machine has a "waiting for the server" state. Write what a refusal does to it in the same
  change that adds the state.

---

## Armadilhas encontradas

**A setting that must never be able to break a match**

- Sintoma: the setting lives in browser storage, which can throw — a private window, a blocked cookie jar.
- Causa real: storage access on a path the player cannot retry.
- Solução: every read and write is in try/catch and falls back to the default (on). A failure loses the setting,
  not the game.
- Sinal de alerta: `localStorage` reached without a guard on a path the player depends on.

**One accessor, copied twice**

- Sintoma: the locale storage and the setting storage each had their own three-line try/catch accessor.
- Causa real: the second one was written by copying the first.
- Solução: DT-77 moved `browserStorage()` and `KeyValueStorage` to `frontend/src/storage/browser.ts`; the two
  modules import it.
- Sinal de alerta: two modules with the same small try/catch around the same browser API — extract before the
  third one appears.

---

## O que fazer diferente

- [ ] Give a client-side timer a message that names the state it was computed from, and refuse it when stale.
- [ ] Write what a refusal does to the state machine before the machine gets a "waiting" state.
- [ ] Every storage read and write in try/catch, with a default that lets the match continue.
- [ ] One storage accessor for the whole client.
- [ ] When the engine gains a new "is anything possible" question, make it one function — later features
  (meditation, spells) join it instead of adding a second one.

See also [[ea-3-turn-indicator]] (the banner this feature's hint sits beside) and [[ea-5-range-display]] (a
pending move counts as "something left to do", which holds the countdown back).
