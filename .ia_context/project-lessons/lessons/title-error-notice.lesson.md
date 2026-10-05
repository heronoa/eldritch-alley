# Lesson — A failure notice that stays until the player dismisses it, with contrast measured before the colours

**Feature:** title-error-notice (`title-error-notice.plan.md`; `frontend/src/title/notice.ts`; closes DT-68)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

A player who was kept out of a match got a single small red line under the button, with a reason that was often
wrong. The fix had to show the right reason for every failure that keeps the player out, without leaving the
title in a state that a retry could not recover from.

---

## Decisions worth reusing

**The failed state always carries its reason**

- Situation: a failure could be a refusal from the server or a failed download, and the flow kept a reason only
  for some failures.
- Decision taken: `Flow` became a union. The `failed` state always carries a reason, and a new `dismiss` event
  returns the flow to `idle`. A press still retries from `failed`.
- Alternative rejected: keep a nullable reason next to the state. The screen could then show "unavailable" for
  a state that had no reason at all.
- Applies when: a state machine has a state whose only purpose is to explain why it stopped. Make the reason part
  of that state's type.

**The copy for a reason is a pure function**

- Situation: the screen must say the same thing in both languages, for each reason, and the mapping is easy to
  get wrong.
- Decision taken: `notice.ts` maps a reason to a heading and a body, given the copy already resolved for the
  language on screen. It never reads the language itself, and it has no fallback: an unknown reason shows nothing.
- Applies when: a message depends on a reason and on a language. Keep the mapping pure, and test it per reason.

**Colours are measured before they are chosen**

- Situation: the notice's heading sits on a bar, and the first instinct was to use the accent colour.
- Decision taken: the ink on the accent measured 3.90:1, below the 4.5:1 a 12 px line needs. The bar uses the
  button's red instead, at 4.88:1. The panel is opaque, so the sentence's contrast does not depend on what the
  city draws behind it, and it measures 14.12:1. The contrast test pins both values.
- Applies when: a new text sits on a colour that already exists. Measure first, and pin the number in a test, so
  a palette edit cannot change it silently.

**No animation for the notice**

- Situation: the rest of the title moves, and the notice could have arrived with a motion.
- Decision taken: nothing moves in or out. The reduced-motion policy does not need a new case.
- Applies when: a new element joins a screen that already has a motion policy. Keep the new element still until
  there is a reason for it to move.

---

## Armadilhas encontradas

**The first look was too quiet, and the owner saw it in the browser**

- Sintoma: the failure was a 12 px line in red, under the button. The owner saw it in the browser and asked for a
  modal, the same day.
- Causa real: the plan that added the line was written and implemented before the owner saw the screen, so the
  plan's look was never approved.
- Solução: the new-tab plan was marked superseded, and this plan replaced the look. Its wording survived as the
  notice's body.
- Sinal de alerta: a plan whose visual choice has no approval record. Show the screen to the owner before the
  plan is marked done.

**A manual check that the plan could not perform**

- Sintoma: the plan asked to switch the language with the card open. The card is a fixed overlay, and the switcher
  sits under it.
- Causa real: the check was written without the layout that makes it impossible.
- Solução: the plan records that the check cannot be performed, and why, rather than leaving it as an open item.
- Sinal de alerta: a manual check that depends on a control the overlay covers.

**A debt removed from the open list, not re-pointed**

- Sintoma: the debt file had a row pointing to the plan that replaced the first one.
- Causa real: the row described a pointer, and the item was closed in the same step.
- Solução: DT-68 was removed from the open file and closed in the closed file with its resolution.
- Sinal de alerta: a debt row that says "moved" while the item it describes is closed in the same change.

---

## O que fazer diferente

- [ ] Show every new visible element to the owner in the browser before the plan is marked done.
- [ ] Measure the contrast of a new text on an existing colour before choosing the colour.
- [ ] Write a manual check only if the layout lets the player perform it. Otherwise, record why it cannot be done.
- [ ] When a plan is superseded, mark the superseded plan and link the one that replaces it, the same day.
