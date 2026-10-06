# Plan: EA-3 · Turn indicator for the active unit

**Milestone:** lot 1 (before the AWS staging deploy)
**Parent feature:** Playtest 1 feedback
**Layers:** client only
**Created:** 2026-10-05
**Status:** ready for implementation (decision D2 assumed; see below)

## 1. Objective

First-time players cannot tell whose turn it is and think the game is stuck. The client shows the active unit clearly: an arrow above it, a banner at each turn change, the unit's portrait highlighted in the turn queue, and the other units dimmed during that unit's turn. The engine and the server do not change: the turn order is already public state (`turnOrder` in `frontend/src/game/turn-order.ts`).

## 2. Changes by layer

### Client (`frontend`)

| File | Operation | What changes |
|---|---|---|
| `src/game/turn-order.ts` | modify | Export `activeSlot(state)` and `isHumanTurn(state, humanTeam)`. Pure |
| `src/view/unit-look.ts` | modify | Arrow above the active unit, in its team colour. Other units at reduced alpha during that unit's turn |
| `src/view/layout.ts` | modify | Position of the arrow relative to the sprite |
| `src/scenes/HudScene.ts` | modify | Highlight of the active portrait in the turn queue; banner component |
| `src/scenes/widgets.ts` | modify | Banner widget: text, fade-out over 1.5 s |
| `src/i18n/catalog.pt-BR.ts`, `catalog.en-US.ts` | modify | "Sua vez" / "Vez do inimigo"; "Your turn" / "Enemy turn" |
| `src/game/turn-order.test.ts` | modify | Tests for `activeSlot` and `isHumanTurn` |
| Banner decision module (new, pure) | create | `bannerFor(previous, current, humanTeam)`, with tests |

**Banner.** It appears when the active unit changes (`turn-ended`) and at the start of the match. The text follows the active team: the human team reads "Sua vez" (or "Your turn"), the other reads "Vez do inimigo" (or "Enemy turn").

**Fade (decision D1, closed):** 1.5 s, fading out on its own. The banner is not interactive while it fades (no pointer events), so the action bar and the map stay usable underneath.

## 3. Contract of the layer

- **`activeSlot(state): TurnSlot | null`**: the slot of the unit whose turn it is, or `null` when the match is over.
- **`isHumanTurn(state, humanTeam): boolean`**: true when the active unit belongs to the human team.
- **`bannerFor(previous, current, humanTeam): { text, durationMs: 1500 } | null`**: `null` when the active unit did not change.
- **Not done by this layer:** any change to rules, events or server.

## 4. Tests planned

Unit:
- [ ] `activeSlot` returns the unit at `currentIndex` of the initiative.
- [ ] `activeSlot` returns `null` when the match is over.
- [ ] `isHumanTurn` is true for a human unit and false for an enemy.
- [ ] `bannerFor` returns a banner with the text for the active team when the unit changes.
- [ ] `bannerFor` returns `null` when the active unit stays the same (for example, after a move).
- [ ] Both catalogs have the banner keys (existing `catalog.test.ts`).

Manual, desktop and mobile emulation:
- [ ] The arrow stays on the active unit while the camera moves.
- [ ] The fading banner does not block the action bar or a tap on the map.

## 5. Dependencies

- None in lot 1.
- The camera follow of EA-12 comes later; the arrow works without it.
- EA-9 reuses the banner for "Vez do inimigo"; keep the banner reusable.

## 6. Decisions

- **D1. Banner duration (closed):** 1.5 s, fades on its own, not interactive while fading.
- **D2. Dimming of other units (assumed, not answered):** alpha 0.6 for the units that are not acting. Owner to confirm or change after a phone test.

## 7. Out of scope

- Turn timer (ADR 0004, M5).
- Automatic end of turn (EA-4).
- Camera follow (EA-12).
- Sound (DT-56).
