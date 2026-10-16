# Lesson — Telling a player why a second tab cannot join, using the server's own refusal

**Feature:** new-tab-during-match (`new-tab-during-match.plan.md`; DT-68; replaced by `title-error-notice`)
**Date:** 2026-10-05
**Tags:** `#protocol` `#architecture` `#process`

---

## Context

A player who opened a second tab during a match saw "Server unavailable", which is the wrong reason. The server
was working, and the second tab was refused by a rule. The risk was that the fix would change the server's rule,
which the owner had already decided to keep.

---

## Decisions worth reusing

**The client reads the refusal the server already sends**

- Situation: the server refuses a second human with a `room full` error, and the test suite already asserted that
  message.
- Decision taken: the client maps the refusal to a reason, `occupied` for the room's refusal and `unavailable` for
  everything else. No server change, and no protocol change.
- Alternative rejected: route the second tab into its own battle, or let it into the existing match. The owner
  rejected both, and the second would need the matchmaker to stop offering an occupied room.
- Applies when: a client shows a failure that the server already explains. Read the explanation, and leave the
  rule where it is.

**The mapping never throws**

- Situation: the failure can be any value a `catch` receives, not always an `Error`.
- Decision taken: a `null`, an `undefined` or a bare string gives `unavailable`. The function does not retry and
  does not decide what the screen says.
- Applies when: a classifier sits on an error path. It must answer for every input, because the error path is the
  one that runs when things are already wrong.

**The wording is true in both situations that produce the refusal**

- Situation: the refusal happens during a match in progress, and also after a match has finished, while the room
  still exists.
- Decision taken: the line says "You already have a match open in another tab", which is true in both.
- Applies when: a message covers more than one cause. Check each cause before writing the sentence.

**A known debt is written into the plan, with the feature that will change it**

- Situation: once PvP has player identity, "room full" will mean "another player is in this battle", and the line
  becomes wrong.
- Decision taken: the plan records that the identity work must revisit the line.
- Applies when: a message describes a rule that a planned feature will change. Name that feature in the plan.

---

## Armadilhas encontradas

**The plan's status outlived its own closure**

- Sintoma: the status said the browser checks had not been run, and that DT-68 was still open. Both were already
  done and closed.
- Causa real: the status line was written before the checks, and it was not updated when the owner ran them. The
  plan was also superseded the same day, and the status was not revisited.
- Solução: the status was corrected on 2026-10-05.
- Sinal de alerta: a plan status that still says "not run" while the debt file says "closed".

**A plan approved for one look, replaced the same day**

- Sintoma: the owner saw the line in the browser and asked for a modal instead.
- Causa real: the plan defined the line's look before the owner had seen it.
- Solução: the plan was marked superseded, and its wording was kept in the replacement.
- Sinal de alerta: a plan whose visual is decided without an owner look. See `title-error-notice`.

---

## O que fazer diferente

- [ ] When a debt closes, update the status line of every plan that describes it in the same change.
- [ ] Write the message as the player will read it, and check every cause it covers.
- [ ] When a rule is kept on purpose, say so in the plan, so a later reader does not reopen it.
