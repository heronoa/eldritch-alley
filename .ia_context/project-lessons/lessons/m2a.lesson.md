# Lesson — A playable match against a bot, server first, and HUD views that outlived their reference

**Feature:** m2a (`m2a.index.md`, server, logic, integration, and the HUD index with its data plan; PR #6 for the playable match)
**Date:** 2026-10-05
**Tags:** `#protocol` `#architecture` `#process`

---

## Context

M2-a made the first match playable in the browser against a bot, on a server that had to stay authoritative
and survive a reload. The risk was not one hard part, but a chain: each layer depended on the one before, and
the screens were drawn before the look of the board was settled.

---

## Decisions worth reusing

**The server keeps the engine state private and sends plain messages**

- Situation: Colyseus offers a schema-based state sync, and the engine already owns the rules.
- Decision taken: the room keeps the engine's match state in a private field and sends JSON messages: `state`
  (the public state), `events`, `rejected` and `ended`. The state is not a Colyseus schema.
- Alternative rejected: Colyseus schema as the state. It would make the engine's public state a second model.
- Applies when: an authoritative engine sits behind a network layer. Keep one model, and send its public view.

**Reconnection is a window, and the window's expiry is a rule**

- Situation: a dropped player should be able to return, and a player who never returns must not hold the match.
- Decision taken: `allowReconnection` for 120 seconds on drop. The client gets the full state on return. If
  the window expires, the human's team loses and the room says so.
- Applies when: any match that outlives a connection. Write the expiry as a game rule, not as a timeout.

**Order the layers so each one can be approved alone**

- Situation: the server, the logic, the integration and the design depend on each other.
- Decision taken: server first, then the frontend logic (which can be built against the protocol file alone),
  then the integration (which needs a running server), then the design. Each plan has its own acceptance list.
- Applies when: a feature crosses the network. The logic that needs no browser goes before the scenes.

**HUD data is pure, and the view is last**

- Situation: the turn order, the legal actions, the highlights and the panel have rules that the view would
  otherwise hide.
- Decision taken: the HUD's data plan built `turn-order`, `actions`, `highlight` and `panel` as tested modules,
  with `maxHealth` in the protocol, before any drawing.
- Applies when: a screen has rules. Put them in a module that a test can reach.

---

## Armadilhas encontradas

**Views approved against a look that was later replaced**

- Sintoma: the HUD view (a carousel and action bar on a 1280×720 canvas) and the design plan (colours, labels,
  layout) were planned and approved, then superseded by the isometric board's overlay and the visual identity.
- Causa real: the views were written before the look of the board was decided. The design plan came before the
  visual identity feature, and the HUD view before the iso-board.
- Solução: both were marked superseded on 2026-10-05, by the owner's decision. The data plan stayed, since its
  modules are still in use.
- Sinal de alerta: a view plan whose reference (a visual direction, a canvas size) is still an open question.

**An index that says "aprovado" over plans that still said "pendente"**

- Sintoma: the m2a index marked the three server and frontend plans as approved, while each plan's own status
  still read "pendente", with 38 checklist items open.
- Causa real: the index was updated at the merge, and the plans were not.
- Sinal de alerta: a status that disagrees between an index and the plan it links.

**A rule that came back as a real case**

- Sintoma: the server refuses a second client for the team A seat. A second tab during a match then shows the
  wrong reason, and the case is now a separate debt (DT-68).
- Causa real: the rule was written for the bot match, where the seat holder is the only human, and nobody wrote
  down what a second tab should see.
- Sinal de alerta: a refusal rule with no message written for the person who hits it.

---

## O que fazer diferente

- [ ] Do not approve a view while its visual reference is still open. Mark it as waiting, not approved.
- [ ] When an index is updated, update the status line of each plan it links.
- [ ] For every refusal rule, write the message the player sees and the case it covers.
- [ ] When a later feature replaces a screen, check the earlier plans for that screen and mark them superseded.
