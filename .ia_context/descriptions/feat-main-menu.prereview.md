# Pre-review — Title screen: living city, character walkers and a call to action that starts a match

**Branch:** `feat/main-menu`
**Generated on:** 2026-10-04

The author runs these before opening the MR. Automated checks already pass on this branch
(`tsc --noEmit`: clean; `vitest run`: 27 files, 307 tests). The manual scenarios below are not yet
checked.

---

### 1. What to test

Ordered from most to least critical. Start the server (`backend/game-server`) and the frontend
(`npm run dev` in `frontend`) before the manual checks.

- **Happy path, button:** open the page. The city walks, the name and tagline show, and the footer
  reads `v0.1`. Click "Iniciar partida" → the stamp slams in (about 180 ms), "PARTIDA AUTORIZADA"
  shows, then the title is hidden and the match loads with the bot. Expected: the match board appears
  with no black screen.
- **Happy path, keyboard:** reload, press Enter (the hint "ou pressione Enter" is on the page). Same
  result as the button.
- **Double press:** click the button twice quickly. Expected: one match starts; no second game, no
  error in the console (the `startMatch` guard would throw otherwise).
- **Server down:** stop the game server, reload, click the button. Expected: the stamp goes away, the
  button returns to "Iniciar partida", and "Servidor indisponível" appears. The page stays usable: the
  player can try again once the server is back.
- **Server down, then up:** with the server stopped, click, see the failure, start the server, click
  again. Expected: the match starts on the second attempt.
- **Reduced motion:** enable "reduce motion" in the OS or devtools (`prefers-reduced-motion: reduce`).
  Expected: the walkers stop at their start positions, no ambient actions, and the stamp only fades.
- **Phone, 390 px in portrait:** the title fits without horizontal scroll; the button is readable and
  not clipped. Expected: the same layout as the prototype, scaled by CSS.
- **Desktop, 1280×720 and a shorter window (e.g. 1280×600):** the title fits the viewport; the
  canvas is not cropped.
- **Match after the title:** play one turn (move, attack). Expected: the same behaviour as before this
  MR; the HUD draws above the map, the action log works, and the result screen's "Voltar ao início"
  button is shown after a win or loss.
- **Reload during a match:** reload the page mid-match. Expected: the title comes back, nothing is
  left half-drawn.

---

### 2. Code checklist

- [ ] No `any` without a reason in the title modules and `main.ts`
- [ ] No `console.log` or debug code left in `frontend/src/title/` or `main.ts`
- [ ] `startMatch` is called only from `title.ts` (its plan contract says so)
- [ ] `backend/` is untouched in this MR (the protocol does not change)
- [ ] `LobbyScene.ts` removal leaves no import of `'lobby'` anywhere: `grep -rn "lobby" frontend/src`
- [ ] Title strings are only in `title/copy.ts` and `index.html`
- [ ] The Phaser config has no `scene` key (scenes are added in `startMatch`)
- [ ] `npm run build` in `frontend` passes (`tsc --noEmit && vite build`)

---

### 3. Behaviour checklist

- [ ] The city and the seven characters are visible on load, and the characters walk
- [ ] The call to action works by click and by Enter
- [ ] A double press starts only one match
- [ ] A failed connection shows "Servidor indisponível" and returns the button to its idle state
- [ ] The stamp timing (180 ms slam, 1600 ms visible) is visibly right
- [ ] Reduced motion stops the walkers and the ambient actions
- [ ] The title fits at 390 px portrait and at 1280×600 landscape, with no horizontal scroll
- [ ] The footer and meta line are readable (contrast fixes applied)
- [ ] The match starts after the title, plays a full turn, and ends with the result screen
- [ ] "Voltar ao início" from the result screen returns to the title page

---

### 4. Before opening the MR

- [ ] Update `title-screen.index.md`: M2 and M3 status, or document why they are open (see the description's divergences)
- [ ] Move `localization.index.md` to its own branch
- [ ] Decide whether the title M3 (typography, contrast matrix, responsive check) is closed in this MR or the next
