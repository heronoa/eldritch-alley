# Plan — M2-a frontend design: colours, labels and layout only

**Milestone:** m2a-design
**Feature pai:** [m2a.index.md](m2a.index.md)
**Created on:** 2026-10-03
**Status:** pendente

---

### 1. Objective

Make the match readable: a colour set for the teams and the UI text, a legend, and consistent font sizes. No new behaviour and no new files outside the style constants.

### 2. Prerequisites

- `m2a-integration` approved and every manual check in it passed.

### 3. Files

| File | Operation | What changes |
|---|---|---|
| `frontend/src/view/theme.ts` | create | Exports `TEAM_COLOR = { A: 0xd9d4c7, B: 0x3b2f4a }`, `TEXT_COLOR = '#e8e2d0'`, `FONT = 'sans-serif'`, `FONT_SIZE = { title: 32, unit: 18, log: 14 }` |
| `frontend/src/scenes/MatchScene.ts` | modify | Use `theme.ts` values for unit fill, text and log. No other change |
| `frontend/src/scenes/LobbyScene.ts` | modify | Use `theme.ts` values for the button and text |
| `frontend/src/scenes/BootScene.ts` | modify | Use `theme.ts` for the title |

### 4. Contracts

- The colours of heights remain in `heightColor` (logic plan). `theme.ts` does not duplicate them.
- Team colour is the only way to tell the teams apart besides the letter. Keep both.
- The legend is one line under the grid: "Azul claro: você · Escuro: bot · Amarelo: selecionado".

### 5. Tests planned

- [ ] `theme.ts` exports the constants above (a one-line test in `frontend/src/view/theme.test.ts` that imports them).
- [ ] Manual: the reviewer confirms the team colours are distinguishable on the height colours, and the text is readable on each height colour.

### 6. Dependencies

- `m2a-integration` approved.

### 7. Execution steps

1. Write `theme.ts` and its test.
2. Replace the literal values in the three scenes with the constants.
3. Add the legend line in `MatchScene`.
4. Run `npm test -w @eldritch-alley/frontend` and `npm run build -w @eldritch-alley/frontend`.
5. Manual check of section 5.

### 8. Acceptance

- [ ] Automated test passes and the build passes.
- [ ] Manual check passes, and the reviewer records the check in the PR.
- [ ] No change in behaviour: the same clicks produce the same actions as before this plan.

### 9. Out of scope

Artwork, sprites, animations, isometric rendering, sounds, responsive layout.
