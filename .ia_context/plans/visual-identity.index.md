# Index — Visual identity: the "Occult Bureaucracy" direction in the playable client

**Created on:** 2026-10-04
**Branch to create from:** `develop` (suggested name: `feat/visual-identity`)
**Source:** `.ia_context/prototypes/eldritch-alley-map-prototype/` and `.ia_context/prototypes/eldritch-alley-characters-v1/` (READMEs are the spec)

## Goal

Make the playable client (M2-a, Phaser) carry the identity the two prototypes define: the night palette and paper ink, the typewriter titles and the monospace body, the team markers, the 16×24 pixel-art units with their animations and the combat effects. The prototypes are isometric; the client stays a flat 8×8 grid, as decided in the design rules. Rules of the engine and the server do not change.

## Decisions taken before this plan (from the owner's answers)

1. M2-a is delivered and approved (the index is updated).
2. Scope is **option C**: palette and type, the HUD and screens, Phaser-drawn unit details, **and** the pixel-art spritesheets with their animations and effects.
3. The approved HUD **is replaced** by the new identity. The owner re-approves it from screenshots at the end.
4. Team colours: ally ink blue `#6f95d6`, enemy stamp red `#d9473d` (the prototype's values); the active/selected amber becomes paper ink. The enemy red passes the project's 4.5:1 letter floor only with the ink `#0b0e18`, so that ink is the one used.
5. Typography: Special Elite and IBM Plex Mono are **self-hosted** under `frontend/public/fonts/`.
6. Validation: automated contrast tests for every text and marker pair, plus the owner's screenshot review.

## Milestones (frontend order: logic → integration → design)

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [visual-identity-m1-logic.plan.md](./visual-identity-m1-logic.plan.md): tokens, contrast, unit look, animation timelines, effect table (no Phaser) | [x] concluído, aguardando revisão | — |
| 2 | [visual-identity-m2-integration.plan.md](./visual-identity-m2-integration.plan.md): fonts, spritesheets, persistent unit sprites, animations and effects in the match scene | [x] concluído, aguardando revisão | — |
| 3 | [visual-identity-m3-design.plan.md](./visual-identity-m3-design.plan.md): the chrome (HUD, lobby, boot, result), the board heights, the legend (closes DT-27) | [x] concluído, aguardando revisão | — |

## Dependency notes

- M1 depends on nothing. Its tests run in Node, like the rest of `game/` and `view/`.
- M2 depends on M1 approved. It consumes the constants and the pure functions M1 exports.
- M3 depends on M2 approved, because its screenshots must show the final units and animations.
- **Before M3 starts**, confirm DT-30 (the offset action buttons) is closed in `technical-debt.md`. M3 rewrites the `Button` widget, and the fix for DT-30 lives in the same code.
- None of the three plans touches `backend/`. The protocol (`PROTOCOL_VERSION` 2) does not change.
