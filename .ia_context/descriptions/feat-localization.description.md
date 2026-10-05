# MR — Client localization: a typed string catalog, an English title screen and a PT/EN switcher

**Branch:** `feat/localization`
**Base branch:** `develop`
**Milestone:** localization M1, M2 and M3 (`localization.index.md`)
**Ticket(s):** —
**Date:** 2026-10-05

---

### 1. What this MR delivers

The client no longer holds its text in the code: every player-facing string now lives in a typed
catalog under `frontend/src/i18n/`, and the title screen can be read in Brazilian Portuguese or in
American English. The player switches language with a `PT` / `EN` control on the title, the choice is
remembered in that browser, and a browser that asks for Portuguese opens in Portuguese while every
other one opens in English. In the same move, the map and terrain names became keys on both sides —
the client and the server data — so the same map is the same map in either language. The switch
costs the client no new dependency: the module is a few dozen lines with no library behind it
(ADR 0009).

The work landed in the three milestones of the plan: M1 built the module, M2 moved the strings
without changing a single character of Portuguese, and M3 wrote the English title and the switcher.
Until M3, the extraction was invisible; that is why the Portuguese is held against `develop` by
tests, area by area.

Decisions with consequences for the player and for the next work:

- **`pt-BR` is the reference and its keys are the type.** Every other locale is
  `Partial<Record<MessageKey, string>>`, so a key that exists only in a translation is a compile
  error, and a key a locale has not translated yet resolves to the Portuguese text. A half-translated
  client shows Portuguese, never a blank line or a raw key name on screen.
- **Locale resolution is ordered: saved choice, then `navigator.languages`, then `en-US`.** Any `pt*`
  tag opens in `pt-BR`; everything else opens in English, which is the fallback the owner chose.
- **Every access to `localStorage` is wrapped in `try`/`catch`.** A browser with site data blocked
  throws on the very first read, and a private window can behave the same way. Losing the remembered
  choice is acceptable; failing to open the client is not.
- **The message is resolved when the screen draws, never kept in a constant.** M3 forced this:
  `title/copy.ts` was a module of constants, and the switcher turned it into `titleCopy()`, called
  again on every render. A constant would have left half the screen in the old language.
- **The switcher's buttons are built from the list of locales, not written in the markup**, and each
  label carries `lang` set to the language it selects, so a screen reader announces "EN" in English
  instead of reading it with Portuguese phonetics.
- **The server does not change.** The engine and the protocol keep sending codes — `RejectReason`,
  `Event` — and the client is what turns them into sentences, in whatever language its player reads.

**Divergences from the approved plan, named explicitly:**

- **The DT-60 plan is in this branch by accident.** `.ia_context/plans/debt-dt60-reconnect.plan.md`
  came in with `c1576a7` and has nothing to do with localization (CLAUDE.md rule 5). It should move
  to its own branch before this MR is merged.
- **M2's acceptance asked for a snapshot of the pt-BR output; the branch asserts it literally
  instead.** The plan wanted a snapshot of the title, the log reasons, the panel labels and the map
  names against `develop`. The catalog test holds that text as explicit equality assertions
  (`catalog.test.ts`, last block), which serves the same purpose — the Portuguese cannot change in
  silence — without adding snapshot files the reviewer would have to read as diffs.
- **The M2 audit missed two player-facing strings.** `MatchScene.handleDrop()` still had
  "Reconectando..." and "Partida perdida" in the code after the extraction pass; both moved to the
  catalog as part of M2, since finishing the audit is the milestone's subject rather than new scope.
- **The M3 acceptance artifacts were not produced.** The plan asks for screenshots at 390 px and at
  desktop in both locales, and a DevTools measurement of the switcher's contrast. The repository has
  no browser tooling (no jsdom, no Playwright), so the fit was verified by calculation only, and the
  plan index records both artifacts as pending on M3's line. The reviewer should treat them as open.
- **One test premise changed on purpose.** `translate.test.ts` asserted that `t('title.cta')` fell
  back to the Portuguese text. Once en-US translated `title.cta`, the test moved its example to
  `hud.back`, which is still untranslated — the fallback rule is the same, the example had to follow
  the catalog.
- **ADR 0009 is Accepted without the render-time rule.** The rule above ("resolved when the screen
  draws") is what M3 taught, and the ADR does not state it. Since accepted ADRs are not rewritten,
  it either gets a short paragraph now or it waits for a follow-up ADR.

---

### 2. What changed and why it matters

| File | What changed | Why it matters |
|------|--------------|----------------|
| `frontend/src/i18n/catalog.pt-BR.ts` | New. The reference catalog: every key the client can show, in Portuguese | It is the type. Adding a key here is what makes every other locale fall back to it |
| `frontend/src/i18n/catalog.en-US.ts` | New. The English text, title keys only (13 of 76) | What ships translated in this feature; the other 63 keys fall back to Portuguese |
| `frontend/src/i18n/messages.ts` | New. `message(locale, key, params?)` and `missingKeys(locale)` | The placeholder rule lives here: `{name}` is replaced, and a placeholder with no param is left on screen instead of reading "undefined" |
| `frontend/src/i18n/locale.ts` | New. Resolution order and the current locale as module state | A screen never threads a locale through its call chain; resolving lazily keeps `localStorage` and `navigator` out of import side effects |
| `frontend/src/i18n/storage.ts` | New. The saved choice, best-effort | A blocked `localStorage` degrades to "no memory", not to a broken client |
| `frontend/src/i18n/translate.ts` | New. `t(key, params?)`, reading the current locale | The one call sites use; the module's whole public surface is `t`, `setLocale`, `getLocale`, `saveLocale`, `LOCALES` |
| `frontend/src/title/copy.ts` | Constants became `titleCopy()`, read from the catalog | The title is rewritten on a language switch; a constant would go stale |
| `frontend/src/title/language.ts` | New. Which buttons exist, what they show, when a press means nothing | The switcher's rules, testable without a DOM |
| `frontend/src/title/title.ts` | One `render()` writes the page from the copy; the switcher rewrites it; `resetControls` became `renderControls` | The screen has one author. `render()` also sets `<html lang>` and `document.title`, so the tab and the reader follow the language |
| `frontend/src/title/title.css` | `.lang` box (top-right of the stamp block), `.title > div` narrowed to `.title > .block` | The switcher sits inside the block that `showScreen` hides, so it leaves with the title instead of floating over the match |
| `frontend/index.html` | The switcher's box, and a note on the markup's own `lang="pt-BR"` | The markup is the no-script fallback; from load on, the catalog is the source |
| `frontend/src/game/log.ts`, `panel.ts`, `actions.ts` | Labels came from keys, derived by template literal (`log.rejection.${reason}`) | A refusal code with no key is now a compile error, in both languages |
| `frontend/src/scenes/HudScene.ts`, `MatchScene.ts` | Buttons and status lines from the catalog | The two strings the audit had missed are here ("Reconectando...", "Partida perdida") |
| `frontend/src/maps/prototype-maps.ts`, `prototype-palette.ts` | Map titles and terrain names became keys | The map keeps its id; only the text is looked up, per locale |
| `backend/game-server/src/maps/prototype-maps.ts` | The duplicated map titles became the same keys | No behaviour change, no protocol change. The test compares the two maps' keys, so the client and the server cannot drift apart |
| `docs/adr/0009-client-localization.md`, `docs/adr/README.md` | New ADR, recorded as Accepted | Why there is no i18n library, and what this module will not do (plurals, dates, numbers) |
| `.ia_context/plans/localization.index.md` | M1 and M2 closed with their commits; M3 closed with its pending artifacts named | The plan and the code agree about what is done |

Tests: 33 test files and 354 tests pass (`vitest run`), and `tsc --noEmit` is clean. The module has
tests of its own for the resolver, the storage, the translation and the catalogs; the title has
tests for its copy and for the switcher's rules.

---

### 3. What this MR does not deliver

- **The rest of the game's text.** 63 keys still resolve to Portuguese: the battle log and its
  refusal reasons, the unit panel, the four action buttons, the HUD lines, the match status and the
  map names. So a player who picks English gets an English title and a Portuguese match — this is
  decision 8 of the plan, expected in this feature and not a defect. The catalog test prints the list
  of what is left, so the next area starts from a list rather than from an audit.
- **Plurals, gender, dates and number formats.** No message needs them yet; the plan is explicit that
  the first feature that needs one gets its own decision instead of a quiet growth of `t()`.
- **Any backend or engine change.** The protocol, the engine and the bots are untouched; the server
  keeps sending the same codes to every client whatever language its player reads.
- **The M3 artifacts** (screenshots at 390 px and desktop in both locales, contrast measurement of
  the switcher). Recorded as pending on the plan index; they are the author's to produce before the
  merge.

---

### 4. Notes for the reviewer

- **The switcher lives inside the title block on purpose.** `main.ts` hides `main.title` with the
  `hidden` attribute when a match starts, so anything the switcher needs to disappear with the title
  has to be inside that element. `title.css` narrowed `.title > div` to `.title > .block` so the
  block's padding does not land on the switcher's own box.
- **The switcher's panel is `rgba(5, 7, 15, 0.92)`, and the value comes from a calculation.** The
  city canvas is drawn small and blown up, so a bright pixel is a bright block: at 0.78 opacity the
  `--muted` text would sit at about 4.1:1 over the brightest neon and fail WCAG AA. At 0.92 it is
  about 5.8:1 in the worst case. A real DevTools measurement is still pending, and worth doing during
  the review.
- **The English is a drafted translation, not a transliteration** (decision 10). The title's tone is
  deliberate; the place names — "Belém", and the map names — keep their Portuguese form in both
  locales, because they are the setting.
- **Order matters in `title.ts`:** `render()` is called after `let flow: Flow = IDLE`, because it
  reads the flow. Moving it up is a temporal dead zone error, not a style question.
- **The render-time rule is the one thing worth carrying into the next area.** Everything here reads
  the catalog when it draws; the moment a screen caches its text in a constant, a language switch
  leaves it behind.
