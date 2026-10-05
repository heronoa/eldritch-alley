# Index — Localization: pt-BR and en-US for the client

**Created on:** 2026-10-04
**Status:** approved by the owner on 2026-10-04, with the answers in "Decisions taken"
**Branch:** `feat/main-menu` today; the work starts on a new branch from `develop` (suggested name: `feat/localization`), after the title-screen work is merged or committed

## Goal

The browser client supports two languages, Brazilian Portuguese (`pt-BR`) and American English (`en-US`). In this feature, the English translation covers only the title screen. The player switches language on the title screen, and the choice is remembered on that browser. The rest of the game stays in Portuguese, and its translation is a later feature.

## Current state (audit, 2026-10-04)

- The UI text is hardcoded Portuguese in the client, spread over these places:
  - `frontend/src/title/copy.ts`: the title screen's strings. It already gathers them in one file, so it is the model for the others.
  - `frontend/src/game/log.ts`: the rejection reasons in the action log.
  - `frontend/src/game/panel.ts`: the unit panel labels (Movimento, Ação, Munição, Reação).
  - `frontend/src/scenes/HudScene.ts`, `frontend/src/scenes/MatchScene.ts`: buttons and status text ("Voltar ao início", "Vitória", "Derrota", "Versão incompatível").
  - `frontend/src/maps/prototype-maps.ts` and `frontend/src/maps/prototype-palette.ts`: map titles and terrain names.
  - `backend/game-server/src/maps/prototype-maps.ts`: the same map titles, duplicated on the server.
  - `frontend/index.html`: the document `<title>` and the `lang="pt-BR"` attribute.
- The protocol and the engine emit codes, not prose. The client maps codes to text (`log.ts` already does this). That makes localization a client job.
- No i18n library or helper exists. The four prototype READMEs already say "translate when moving into the client".
- Phaser text objects are created when the match scene starts, and the match starts after the title screen.

## Decisions taken

From the owner (2026-10-04):

1. **Fallback locale is `en-US`** for browsers that are neither Portuguese nor saved.
2. **Class and unit names are not translated.** "Sniper", "Wizard", "Priest", "Initiate", "Adept" and the others stay as they are, in both locales. This closes the open question about names; the universe decision in the ROADMAP is still separate.
3. **The English translation happens in M3 and covers only the title screen.** The switcher is on the title screen only.

Taken by this plan (flagged for the owner to object to):

4. **No external library.** A small typed module in `frontend/src/i18n/`: catalogs per locale, a `t(key, params?)` function, and the locale resolver. Recorded as ADR `docs/adr/0009-client-localization.md` (proposed), since it is an architecture choice.
5. **The `pt-BR` catalog is the reference.** Its keys define the `MessageKey` type. The `en-US` catalog is typed `Partial<Record<MessageKey, string>>` until M3 finishes the title. A key missing in `en-US` falls back to its `pt-BR` value. A test lists the keys still untranslated, and it reports them without failing. After M3, the title keys in `en-US` are required, and the test fails on any missing title key.
6. **Locale resolution, in order:** a value saved in `localStorage`, then `navigator.languages` (any `pt*` gives `pt-BR`), then `en-US`. The storage access is wrapped in try/catch.
7. **Switcher.** A two-option control (`PT` / `EN`) on the title. It rewrites the title text and `<html lang>` at once.
8. **Consequence to know:** if a player picks `EN` and starts a match, the match is in Portuguese, because its text is not translated yet. This is expected in this feature.
9. **Map names move to keys** (client and server data). The server keeps the map id. Only the `title` field changes, and no behaviour changes.
10. **English copy is a drafted translation, not a literal one.** The title's tone is noir and deliberate. The owner reviews it before M3 closes. The place names ("Belém", "Rua do Comércio", "Praça Municipal") keep their Portuguese form in both locales. They are the setting.

## Milestones

| # | Milestone | Scope | Depends on | Status |
|---|-----------|-------|-----------|--------|
| 1 | `localization-m1-core`: catalogs, `t()`, resolver, persistence, ADR 0009 | New files in `frontend/src/i18n/` and tests. No visible change. | Approval (given) | [ ] pendente |
| 2 | `localization-m2-extract`: move every string in the audit to keys, with `pt-BR` values identical to today; map names move to keys (client and server data) | Touches `copy.ts`, `log.ts`, `panel.ts`, `HudScene.ts`, `MatchScene.ts`, the map files and `index.html`. No `en-US` text yet. | M1; title-screen M2 and M3 merged or coordinated, since both edit `copy.ts` and the title files | [ ] pendente |
| 3 | `localization-m3-title-en`: `en-US` copy for the title screen, `PT`/`EN` switcher on the title, `<html lang>`, `document.title`, owner review of the copy, screenshots at 390 px and desktop in both locales | Title files, the switcher and its styles, `en-US` catalog (title keys only) | M2 | [ ] pendente |

### Acceptance (each milestone)

- `npm run build` in `frontend` passes (it runs `tsc --noEmit`), and `vitest run` passes with the new tests.
- M1: the resolver tests cover `pt-BR`, `pt-PT`, `en-US`, `fr-FR`, an empty list, and a saved value. The `localStorage` read and write is tested with a throwing storage.
- M2: a snapshot of the `pt-BR` output of the title, the log reasons, the panel labels and the map names matches the text on `develop`, so the Portuguese does not change by accident.
- M3: the title fits at 390 px in both locales with no horizontal scroll (English is often longer), the switcher meets WCAG AA contrast, and the title keys in `en-US` are complete.

## Risks

- **Text length.** English labels can overflow the title's fixed-size elements. Mitigation: check them in both locales during M3.
- **Merge conflicts with the title screen.** `copy.ts` and the title files are in active work on this branch. Mitigation: M1 touches no existing file, and M2 starts only after the title-screen milestones merge.
- **Duplicated map titles.** The frontend and the server both carry the prototype maps. Mitigation: a test compares the two maps' keys.
- **Mixed language in the match after choosing `EN`** (decision 8). Mitigation: none in this feature; the full translation is the next feature.
- **Uncommitted work on this branch.** This plan creates files only and commits nothing. The owner makes every commit, as CLAUDE.md requires.
