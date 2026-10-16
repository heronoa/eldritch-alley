# Lesson — Client localization without a library (pt-BR and en-US)

**Feature:** localization (`localization.index.md`, M1 to M3; `frontend/src/i18n/`, ADR 0009)
**Date:** 2026-10-05
**Tags:** `#architecture` `#testing` `#process`

---

## Context

The client had its text hardcoded in Portuguese across the title, the battle log, the unit panel, the HUD
and the map data. The risk was not the translation itself, which is small. It was changing hundreds of
strings in files that other features were editing at the same time, without changing a single visible
character until the English copy was ready.

---

## Decisions worth reusing

**The reference locale defines the key type; the others are partial**

- Situation: a second language is added to a client with no i18n library, and translation will lag behind.
- Decision taken: the `pt-BR` catalog is the reference, and its keys are the `MessageKey` type. Every other
  locale is `Partial<Record<MessageKey, string>>`. A key missing from `en-US` resolves to its `pt-BR` text.
- Alternative rejected: a library with per-locale fallback files. ADR 0009 chose a few dozen lines of typed
  code, since the project has no other i18n need.
- Applies when: a locale is incomplete by design. A half-translated screen then shows the reference
  language, never a blank line or a raw key name.

**Resolution order is explicit and tested**

- Situation: the locale can come from a saved choice, the browser's list, or a fallback, and the saved value
  comes from storage that the program does not control.
- Decision taken: saved choice, then `navigator.languages` (any `pt*` tag opens in `pt-BR`), then `en-US`.
  The saved value goes through a type guard (`isLocale`), and every storage call is wrapped in `try`/`catch`.
- Applies when: any value read from storage, cookies or the URL. Validate it at the boundary, and treat a
  throwing storage as an empty one.

**Extraction ships invisibly, before any translation**

- Situation: moving strings into keys touches files other branches are editing, and a broken key is only
  noticed on screen.
- Decision taken: M2 moved every string to a key with the `pt-BR` value unchanged and no English text yet.
  The extraction was reviewable on its own, and the Portuguese was held by tests area by area.
- Applies when: any refactor that changes how text is produced but must not change what the user sees.

**Map names move to keys on both sides of the wire**

- Situation: the same map titles lived in the client and in the server's data.
- Decision taken: the server keeps the map id and the key; the client translates. A test in the frontend
  imports the server's copy and compares it field by field, so the two cannot drift.
- Applies when: prose exists in two packages. Prefer a key in one place and a cross-package test over a
  copy that depends on someone remembering to update it.

---

## Armadilhas encontradas

**A label computed at load never changes with the language**

- Sintoma: after switching to EN, the title kept Portuguese in places.
- Causa real: text read once at module load, instead of on every render.
- Solução: the copy is a function (`titleCopy()`), read again by `render()` on every language change, and the
  button label is derived from the flow state on each render.
- Sinal de alerta: a module-level `const` that calls `t()`. It freezes the locale at import time.

**"Concluído" on a milestone whose acceptance list is still open**

- Sintoma: the index marked M3 as concluded while its layout check (390 px, no horizontal scroll) and its
  contrast measurement had not been done. The owner's smoke test passed, and the status followed the smoke
  test, not the acceptance list.
- Causa real (suspeita, não confirmada com o autor): the status followed the main path of the feature, and the
  acceptance items sat in a separate paragraph of the same file.
- Solução: the MR description states the open artifacts. The index should say so too.
- Sinal de alerta: a checked status next to unchecked acceptance items in the same file.

**An index that links plan files that do not exist**

- Sintoma: `localization.index.md` references `localization-m1-core`, `-m2-extract` and `-m3-title-en` as
  milestone plans. No such files exist in `.ia_context/plans/`.
- Causa real: the milestones were specified in the index table only, and the plan files were never written.
- Sinal de alerta: a link in an index that does not resolve. Check links before marking the index approved.

**Tests pin the Portuguese by hand, not by snapshot**

- Sintoma: the acceptance criterion asked for a snapshot of the `pt-BR` output. The tests instead assert
  selected strings written by hand.
- Causa real: a snapshot was not written, so coverage depends on which strings someone listed.
- Verificação feita na revisão: the 253 Portuguese strings found before the extraction all appear, as
  substrings, in the `pt-BR` catalog. This is coverage by substring, not by equality.

---

## O que fazer diferente

- [ ] Write a status per acceptance item, not one status per milestone.
- [ ] Check every link in an index before approving it.
- [ ] Use a snapshot or an exact comparison for the reference locale when the criterion says "identical".
- [ ] Test the DOM wiring of the switcher (`render()`, `<html lang>`, the saved choice on press). It is untested.
