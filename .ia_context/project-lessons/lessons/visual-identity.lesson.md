# Lesson — Restyling a Phaser client by contrast numbers, not by eye

**Feature:** visual-identity (`visual-identity.index.md`, M1 to M3; `frontend/src/view/`, PR #8)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The playable client was a flat, functional HUD. The new identity brought a night palette, paper ink, a
typewriter title face, pixel-art units with animations, and combat effects. The risk was that a palette
taken from a prototype fails the project's own readability floor on the client's real backgrounds.

---

## Decisions worth reusing

**Each text and marker pair is a test, not a judgement**

- Situation: the enemy team colour is a stamp red, and it sits on a dark board.
- Decision taken: the contrast of every text and marker pair is computed by `view/contrast.ts` and asserted
  in tests. The enemy red passes the 4.5:1 floor only with the dark ink `#0b0e18`, so that ink was chosen
  because the numbers allowed it, not because it looked right.
- Applies when: a palette change touches text. Compute the ratio before the screenshot review.

**The look is data, and the data is tested in Node**

- Situation: the tokens, the unit look and the animation timelines are values that must stay consistent
  with each other.
- Decision taken: M1 wrote them as pure modules (`theme.ts`, `unit-look.ts`, `animation.ts`, `effects.ts`)
  with Node tests. Phaser only consumes them, in M2.
- Applies when: a visual change has numbers that must agree. Keep them out of the scene.

**Self-hosted fonts instead of a web font service**

- Situation: the two typefaces could come from a font CDN.
- Decision taken: the fonts are served from `frontend/public/fonts/`, so the page makes no third-party
  request for them.
- Applies when: the page is public and the requests have a privacy or performance cost.

---

## Armadilhas encontradas

**A palette passes on the base colour and fails on its states**

- Sintoma: the title screen plan asks for the button's hover and focus states to keep the text readable.
  The hover background gives about 4.15:1 with the ink. The footer text gives about 4.02:1 on the night
  background. Both are below 4.5:1.
- Causa real: the palette was checked against the base colours. The states and the small footer text were
  not in the matrix.
- Solução: the contrast test in the title screen now records both values. Raising them changes the
  approved look, so the owner decides.
- Sinal de alerta: a contrast list that has no entries for hover, focus, disabled or small print.

**Plan file lists kept names that were replaced**

- Sintoma: the M2 plan names `LobbyScene.ts`, which the title page replaced.
- Causa real: the plan was written before the screen moved, and nothing checked its file list against the
  tree.
- Sinal de alerta: a file list that does not resolve. The same check that found the iso-board drift applies
  here.

---

## O que fazer diferente

- [ ] Put hover, focus, disabled and small text into the contrast matrix from the start.
- [ ] Decide the floor before the palette, and write the owner's exception in the plan when one is granted.
- [ ] Check every file a plan names against the tree when the milestone closes.
