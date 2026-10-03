# Index — M2-a HUD: turn-order carousel, action buttons and unit status panel

**Created on:** 2026-10-03
**Source:** [ROADMAP.md](../../ROADMAP.md) M2-a ("initiative queue and action log"), [m2a.index.md](m2a.index.md)

The match is playable but barely readable: no turn order, no health, and no way to reload or to end
the turn — both legal engine actions the bot uses and the client can never send. This feature adds
the HUD that closes those gaps.

Order of execution: data first, then view. Each plan has an acceptance list and can be reviewed
alone. The data plan needs no browser; the view plan needs a running server.

| # | Plan | Status | PR |
|---|------|--------|----|
| 1 | [m2a-hud-data.plan.md](m2a-hud-data.plan.md): `maxHealth` on the unit state, protocol v2, and the pure `turn-order` / `actions` / `highlight` / `panel` modules | [ ] pendente | — |
| 2 | [m2a-hud-view.plan.md](m2a-hud-view.plan.md): the carousel, the action bar and the panel drawn on a 1280×720 canvas | [ ] pendente | — |

## Decisions taken

| Question | Decision |
|---|---|
| Mana and reaction | Disabled placeholders: the space is reserved and dimmed, never hidden |
| Max health | Added to the engine and the protocol; `PROTOCOL_VERSION` 1 → 2 |
| Action buttons | Mode buttons: `Mover` / `Atacar` arm the next board click, `Recarregar` / `Terminar turno` send at once |
| Canvas | 1280×720, with `Scale.FIT` |
| `MAX_HEALTH_BY_UNIT_ID` | Deleted; the bot reads `unit.maxHealth` |

## Dependency notes

- **Data before view.** The view plan imports `turnOrder`, `actionButtons`, `settleMode`, `applyMode`,
  `highlightedCells` and `unitPanel`, and the panel cannot show `health/maxHealth` until the state
  carries it.
- **The data plan is the only one that touches the backend.** It changes the engine and the protocol
  version, so it is the one that needs a reviewer looking at the wire.
- **`frontend/src/game/selection.ts` is not modified by either plan.** `applyMode` only ever removes
  an intent that `resolveClick` already produced, so the click rules stay in one place.
- **`frontend/src/view/grid.ts` is not modified by either plan.** The board keeps its position; all
  the new space is on the right and the bottom.
- The scene itself has no automated test — no DOM, no Phaser harness, and the frontend vitest config
  says rendering is not tested here. The view plan therefore carries a manual checklist, and every
  decision it would otherwise hide in a scene method lives in a tested `game/` or `view/` module.

## Out of scope for the whole feature

Mana, reactions, abilities and any real resource rule (M3 — ADR 0002, ADR 0007); the DT-24 fix
(`selection.ts:21` does not ignore `permanentlyDead`) and the DT-25 fix (the `move-preview` variant is
declared and never returned); artwork, sprites, animation and sound; responsive layout beyond the
single `Scale.FIT`; the hard-coded 8×8 board.
