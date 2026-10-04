# Index — Title screen: the entry screen of the client, from the title-screen prototype

**Created on:** 2026-10-04
**Branch to create from:** `develop`, after the visual identity feature is merged (suggested name: `feat/title-screen`)
**Source:** `.ia_context/prototypes/eldritch-alley-title-screen/` (its README and code are the spec)

## Goal

Replace the current `BootScene` title and `LobbyScene` with the title screen of the prototype: a living
isometric city behind the game name, the seven v1 characters walking and playing their ambient actions,
and a call to action that starts a match against the bot.

## Decisions taken (owner's answers, then the plan's own)

From the owner (all option A):

1. **City:** a fixed map written as data, the same 16×16 layout the prototype generates, frozen once.
2. **Neutral characters:** a third spritesheet, `spritesheet-neutral.png`, exported from the prototype's drawing code, with the grey armband.
3. **Call to action:** starts a match against the bot with the same flow as today. The text becomes "Iniciar partida". No team selection in this feature.
4. **Stamp and connection:** the stamp appears on click. The screen changes once the server confirms the connection, and never before the stamp's 180 ms slam. On failure the stamp goes away and "Servidor indisponível" appears, as today.
5. **Order:** after the visual identity feature is complete (its M3 approved).
6. **Reduced motion:** with `prefers-reduced-motion`, walkers stop at their start positions, ambient actions are off, and the stamp only fades.

Taken by the plan (not in the answers, flagged for the owner):

7. **Rendering technology.** The title is an HTML page with a canvas behind it, not a Phaser scene. The Phaser game is created only after the connection succeeds. Reason: the client's Phaser canvas uses `Scale.FIT`, which renders the title's 18 px button at about 5 px on a 390 px phone in portrait. The HTML title scales with CSS, and it keeps the prototype's structure. The game still uses Phaser for the match, unchanged.
8. **The isometric city is only the title backdrop.** Decision 2 of the visual identity feature ("the board stays flat") is about the match board, and it still holds.
9. **Colour fixes against the prototype, for WCAG AA:** the meta line uses `#d9473d` instead of `#c8322a` (3.78:1 on the background, 4.71:1 after); the footer colour is raised to the lightest muted tone that passes 4.5:1 (the M1 plan computes the value). The CTA keeps the prototype's `#a8322a` (5.56:1 with `#f3ead6`).
10. **Footer text:** `v0.1` only. The prototype's "protótipo" word does not ship.

## Milestones (frontend order: logic → integration → design)

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [title-screen-m1-logic.plan.md](./title-screen-m1-logic.plan.md): city data, walkers, ambient schedule, stamp timing, connection state machine (no DOM) | [ ] pendente | — |
| 2 | [title-screen-m2-integration.plan.md](./title-screen-m2-integration.plan.md): HTML title, canvas city, walkers and effects, connection, lazy Phaser start, neutral sheet | [ ] pendente | — |
| 3 | [title-screen-m3-design.plan.md](./title-screen-m3-design.plan.md): typography, stamp, CTA, responsive composition, reduced motion, contrast matrix | [ ] pendente | — |

## Dependency notes

- Depends on **visual identity M3 approved**: the fonts, the palette and the stamp colour are tokens from there. The title uses the same `frameIndex`, `idleFrame`, `walkFrame` and `attackFrame`-style helpers from `view/unit-look.ts` and `view/animation.ts`, so those must exist.
- M1 has no dependency inside this feature.
- M2 depends on M1 approved. M3 depends on M2 approved.
- The `LobbyScene` file is removed in M2. Its test expectations move to the connection state machine of M1.
- `backend/` does not change. The protocol does not change.
