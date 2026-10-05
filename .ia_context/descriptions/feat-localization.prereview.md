# Pre-review — Client localization: a typed string catalog, an English title screen and a PT/EN switcher

**Branch:** `feat/localization`
**Generated on:** 2026-10-05

The author runs these before opening the MR. The automated checks already pass on this branch
(`tsc --noEmit`: clean; `vitest run`: 33 files, 354 tests). The scenarios below are manual, and the
last three sections are the open items this branch still owes.

---

### 1. What to test

Ordered from most to least critical. Start the game server (`backend/game-server`) and the frontend
(`npm run dev` in `frontend`) before the manual checks.

- **Language switch, happy path:** open the title with the browser in Portuguese. Click `EN`.
  Expected: the whole title turns English at once — meta line, name, stamp tag, tagline, call to
  action, hint, stamp and footer — with nothing left in Portuguese, and the tab's name becomes
  "Eldritch Alley: Tactics". Inspect `<html lang>`: it reads `en-US`.
- **The choice is remembered:** with English on screen, reload. Expected: the page opens in English,
  the `EN` button reads as pressed (highlighted, `aria-pressed="true"`), and no flash of Portuguese.
  Then clear site data (`localStorage`) and reload: the browser's own language decides again.
- **Browser language decides the first visit:** with a clean storage, set the browser to `pt-PT` and
  reload → Portuguese. Set it to `fr-FR` (or `en-GB`) and reload → English, which is the fallback.
- **Storage blocked:** block cookies/site data for the origin (or open a private window), reload and
  switch language. Expected: the screen still changes normally and nothing throws in the console;
  only the memory is lost on the next reload.
- **Pressing the language already on screen:** with Portuguese on screen, click `PT`. Expected:
  nothing changes at all — no rewrite, and no second value written to storage.
- **The call to action during the switch:** click "Iniciar partida". While the button reads
  "Conectando…" and is disabled, switch language. Expected: the button stays disabled and only its
  text follows the language; it does not become clickable before the match takes the screen. This is
  the regression M3 introduced and fixed — check it deliberately.
- **Server down, in both languages:** stop the game server and click the button. Expected: the stamp
  goes away, the button answers again, and "Servidor indisponível" appears. Switch language while the
  error is showing → the same line in English, with the button still usable. Start the server and
  click again → the match starts.
- **A match after picking English:** with English on screen, start a match. Expected: the HUD, the
  log, the unit panel, the action buttons and the map name are in Portuguese — this is decision 8,
  the expected state of this feature. Nothing may be blank or show a key name like `panel.label.hp`.
- **Back from a match:** finish or leave the match and use "Voltar ao início". Expected: the title
  comes back in the language that was chosen, the call to action is usable, and the city resumes.
- **Empty state:** reload with the network throttled and watch the switcher's slot while the script
  is still loading. Expected: no empty box is drawn — the element hides itself while it has no
  buttons. It must not show as a blank rectangle over the title.
- **Layout in both locales:** at 390 px in portrait and at 1280×720 on desktop, in Portuguese and in
  English. Expected: no horizontal scroll in either, the switcher does not overlap the name, the
  stamp or the footer, and the longer English lines are not clipped.
- **Reload during a match:** reload mid-match. Expected: the title comes back, in the saved language,
  with nothing half-drawn.
- **Screen reader:** with a screen reader on, focus the switcher. Expected: the group is announced
  with the word for "language" in the language on screen, and the `EN` button is pronounced in
  English rather than read with Portuguese phonetics.

---

### 2. Code checklist

- [ ] No player-facing Portuguese left outside the catalogs:
      `grep -rnE "[çãõáéíóúâêôà]" frontend/src --include=*.ts | grep -v "src/i18n/catalog"` — the
      remaining hits are comments and test fixtures, not strings on screen
- [ ] `backend/` diff is limited to the map `title` data and its test; the engine and the protocol are
      untouched (`git diff develop...HEAD --stat -- backend/`)
- [ ] No `any` in `frontend/src/i18n/`
- [ ] No `console.log` left; the single `console.info` in `catalog.test.ts` is intentional — it is the
      report of the areas still untranslated
- [ ] Every key was added to `pt-BR` first (it is the type) and `en-US` holds no key `pt-BR` lacks
- [ ] No text is held in a module-level constant that a language switch would leave stale
- [ ] `npm run build` in `frontend` passes (`tsc --noEmit && vite build`)
- [ ] `npx vitest run` passes (33 files, 354 tests)
- [ ] `.ia_context/plans/debt-dt60-reconnect.plan.md` is off this branch

---

### 3. Behaviour checklist

- [ ] The title switches language by click, in one pass, with no line left behind
- [ ] `<html lang>`, the tab name and the switcher's own label follow the language
- [ ] The choice survives a reload, and a blocked `localStorage` does not break the page
- [ ] A `pt*` browser opens in Portuguese and any other opens in English
- [ ] The call to action never becomes clickable during `connecting` or during the stamp
- [ ] The failure line appears, and is rewritten, in the language on screen
- [ ] A match started in English shows Portuguese text and never a key name or a blank
- [ ] "Voltar ao início" returns to the title in the chosen language
- [ ] The switcher draws nothing while it is empty
- [ ] 390 px portrait and 1280×720 desktop fit in both locales, with no horizontal scroll
- [ ] The switcher's text is readable over the city canvas

---

### 4. Before opening the MR

- [ ] Move `debt-dt60-reconnect.plan.md` to its own branch
- [ ] Produce the M3 artifacts and close the milestone: screenshots at 390 px and at desktop in both
      locales, and the DevTools contrast measurement of the switcher
- [ ] Decide the render-time rule in ADR 0009: a paragraph in the accepted ADR, or a follow-up ADR
- [ ] Confirm the plan index M3 line reflects whatever comes out of the two items above
