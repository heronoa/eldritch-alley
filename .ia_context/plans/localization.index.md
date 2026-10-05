# Index — Localization: pt-BR and en-US for the client

**Created on:** 2026-10-04
**Status:** proposed, waiting for the owner's approval (CLAUDE.md rule 4)
**Branch:** `feat/main-menu` today; the work starts on a new branch from `develop` after approval (suggested name: `feat/localization`)

## Goal

The browser client ships in two languages, Brazilian Portuguese (`pt-BR`) and American English (`en-US`). Every text a player reads is translated: the title screen, the match HUD, the action log, the result screen, the map names and the palette names. The server does not send prose, so it needs no translation. The player can switch language on the title screen, and the choice is remembered on that browser.

## Current state (audit, 2026-10-04)

- The UI text is hardcoded Portuguese in the client, spread over these places:
  - `frontend/src/title/copy.ts`: the title screen's strings. It already gathers them in one file, so it is the model for the others.
  - `frontend/src/game/log.ts`: the rejection reasons in the action log.
  - `frontend/src/game/panel.ts`: the unit panel labels (Movimento, Ação, Munição, Reação).
  - `frontend/src/scenes/HudScene.ts`, `frontend/src/scenes/MatchScene.ts`: buttons and status text ("Voltar ao início", "Vitória", "Derrota", "Versão incompatível").
  - `frontend/src/maps/prototype-maps.ts` and `frontend/src/maps/prototype-palette.ts`: map titles and terrain names.
  - `backend/game-server/src/maps/prototype-maps.ts`: the same map titles, duplicated on the server.
  - `frontend/index.html`: the document `<title>` and the `lang="pt-BR"` attribute. The page is already declared Portuguese, so `lang` must follow the chosen locale.
- The protocol (`backend/game-server/src/protocol.ts`, `frontend/src/protocol.ts`) and the engine emit codes, not prose. The client maps codes to text (`log.ts` already does this). That makes localization a client job.
- No i18n library or helper exists. The four prototype READMEs already say "translate when moving into the client".
- Phaser text objects are created when the match scene starts, and the match starts after the title screen. So the locale only has to be settled before the Phaser game is created, and the title is the only screen that must update live.

## Decisions proposed (for the owner to confirm)

1. **No external library.** A small typed module in `frontend/src/i18n/`: one catalog per locale, a `t(key, params?)` function, and a resolver for the locale. Reasons: the client is small, the text is short, the bundle stays small, and the dependency surface stays the same. The i18next-style plural and ICU rules are not needed for the current text. Recorded as an ADR (`docs/adr/0009-client-localization.md`, proposed), since it is an architecture choice.
2. **Compile-time completeness.** The `pt-BR` catalog is the reference: its keys define the `MessageKey` type. The `en-US` catalog is typed `Record<MessageKey, string>`, so a missing English key fails `tsc`. A test also checks that no value is empty.
3. **Locale resolution, in order:** a value saved in `localStorage`, then `navigator.languages` (any `pt*` gives `pt-BR`), then the fallback. The saved value is a per-viewer convenience only, which the rules allow, and wrapped in try/catch.
4. **Switcher on the title screen.** A two-option control (`PT` / `EN`) on the title. Changing it rewrites the title text and `<html lang>` at once. The Phaser match picks up the same locale when it starts.
5. **Map names move to keys.** Map and palette entries carry a message key instead of a Portuguese string. The server keeps the map id; the client resolves the name. This touches `backend/game-server` data, but only the `title` field, and no behaviour changes.
6. **English copy is a drafted translation, not a literal one.** The title's tone is noir and deliberate. I draft `en-US`, and the owner reviews it before M3 closes. The place names ("Belém", "Rua do Comércio", "Praça Municipal") keep their Portuguese form in both locales. They are the setting, not the UI.

## Open questions for the owner

A. **Fallback locale.** Browsers in other languages: fall back to `en-US` (the international default), or to `pt-BR` (the language the game is written in today)? This plan assumes `en-US`.

B. **Class and unit names.** Do "Sniper", "Wizard", "Priest", "Initiate", "Adept" and the other class names get translated? They are part of the setting, and the ROADMAP already says the universe decision (Magia Urbana or not) affects names and must come before M3. Proposal: keep the in-fiction names in English in both locales until that decision is made, and translate only the UI around them.

C. **Switcher placement.** Only on the title screen (proposal), or also inside the match HUD? The HUD option would need the match to rebuild its text on the fly, which is more work.

## Milestones

| # | Milestone | Scope | Depends on | Status |
|---|-----------|-------|-----------|--------|
| 1 | `localization-m1-core`: catalogs, `t()`, resolver, persistence, ADR 0009 | New files in `frontend/src/i18n/` and tests. No visible change. | Approval | [ ] pendente |
| 2 | `localization-m2-extract`: move every string listed in the audit to keys; translate `pt-BR` as it is today and draft `en-US`; map names move to keys (client and server data) | Touches `copy.ts`, `log.ts`, `panel.ts`, `HudScene.ts`, `MatchScene.ts`, the map files and `index.html`. Pt-BR output must stay identical. | M1; title-screen M2 and M3 merged or coordinated, since both edit `copy.ts` and the title files | [ ] pendente |
| 3 | `localization-m3-switch`: `PT`/`EN` switcher on the title, `<html lang>`, `document.title`, owner review of the `en-US` copy, screenshots at 390 px and desktop in both locales | Title files and the switcher styles | M2 | [ ] pendente |

### Acceptance (each milestone)

- `npm run build` in `frontend` passes (it runs `tsc --noEmit`), and `vitest run` passes with the new tests.
- M1: the resolver tests cover `pt-BR`, `pt-PT`, `en-US`, `fr-FR`, an empty list and a saved value. The `localStorage` read and write is tested with a throwing storage.
- M2: a snapshot of the `pt-BR` output of the title, the log reasons, the panel labels and the map names matches the text on `develop`, so the Portuguese does not change by accident.
- M3: the title and the HUD fit at 390 px in both locales with no horizontal scroll (the English text is often longer), and the switcher meets WCAG AA contrast.

## Risks

- **Text length.** English labels can overflow the fixed-size panel and button rectangles in `HudScene`, `panel.ts` and `widgets.ts`. Mitigation: check every label in both locales during M3, and widen rectangles, never shrink text below the current size.
- **Merge conflicts with the title screen.** `copy.ts` and the title files are in active work on this branch. Mitigation: M1 touches no existing file, and M2 starts only after the title-screen milestones merge.
- **Duplicated map titles.** The frontend and the server both carry the prototype maps. A key on one side and text on the other would drift. Mitigation: the key lives in one shared field, and a test compares the two maps.
- **Uncommitted work on this branch.** The title-screen files are not committed yet. This plan creates files only and commits nothing. The owner makes every commit, as CLAUDE.md requires.
