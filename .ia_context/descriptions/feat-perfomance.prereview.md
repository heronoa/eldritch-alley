# Pre-review — Reconnection after a reload, title-screen failure notice, depth table, and housekeeping

**Branch:** `feat/perfomance`
**Generated on:** 2026-10-05

---

### 1. What to test

Organised from most to least critical. Run `npm run dev` in `frontend/` against a local game server, unless noted.

- **Reload during a match against the bot:** start a match from the title, press F5 on the board, press the
  title's button again. Expected: the match returns with the board and the HUD as they were. Owner checked this on
  2026-10-05.
- **Reload after the seat expired (more than 120 s without the match):** the resume is refused, the title starts a
  new match, and no "Server unavailable" appears. Expected: a new match starts.
- **Reload after a finished match:** the resume is refused; the title starts a new match.
- **Second tab during a match:** open the game in a second tab while the first is in a match. Expected: the second
  tab shows the modal "You already have a match open in another tab" (pt-BR: "Você já tem uma partida aberta em
  outra aba"), with a close control. Escape and the close button dismiss it, and the button is usable again.
- **Server down at the press:** stop the game server, press the button. Expected: the modal "Server unavailable"
  (pt-BR "Servidor indisponível"). Restart the server, press again: the match starts.
- **Failed download of the match module:** block the match chunk in the browser's network tools, press the
  button. Expected: the load-failed modal; the title stays usable.
- **Language switch with the modal open:** not performed. The modal is a fixed overlay under which the switcher
  sits, so the switch cannot be reached while it is up. This is expected, not a defect.
- **Match draw order:** play one turn with an attack. Expected: attack effects appear above the board, units are
  drawn in front of tiles they stand beside, and the HUD is above everything.
- **Map zoom and effects:** zoom to 2.5× with the wheel during a match. Expected: the HUD keeps its size, and an
  attack effect still appears above the board.

Error and empty states are covered: the server down, the load failure, the refused resume, and the dismiss path.

---

### 2. Code checklist

- [ ] No `any` added without justification in `session.ts`, `join-failure.ts`, `notice.ts`, `depth.ts`.
- [ ] No `console.log` or debug code in the diff.
- [ ] No snackbar; the failure is a notice in the title, as the design asks.
- [ ] `session.ts` `reconnect()` removes the stored token only on a recognised refusal (522 or 524 with the server's words); a tunnel timeout keeps it.
- [ ] `title.ts` uses `open()` in `press()`, not `connect()`.
- [ ] Contrast test values match `title.css`; the two known gaps are recorded, not hidden.
- [ ] `HUD_DEPTH` and `EFFECT_DEPTH` are not referenced anywhere outside the table.
- [ ] `npx vitest run` in `frontend/` shows 403/403; `npx tsc --noEmit` clean.
- [ ] `npm run build` in `frontend/` passes (the bundle warning on the match chunk is expected).

---

### 3. Behaviour checklist

- [ ] A reload during a match returns to the match.
- [ ] A second tab during a match shows the reason, not the generic line.
- [ ] The modal closes with the button and with Escape, and the title is usable afterwards.
- [ ] Language switch on the title changes the modal copy only when the modal is closed.
- [ ] The match looks the same as before the depth table: board, units, highlights and effects in their usual order.
- [ ] No Phaser chunk loads before the first press on the title.
