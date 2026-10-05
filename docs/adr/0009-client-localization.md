# 0009. Client-side localization without a library

**Status:** Proposed

## Context

The browser client shows its text in Portuguese, hardcoded and spread over the title screen, the
battle log, the unit panel, the HUD and the map data. The plan for localization asks for a second
language, `pt-BR` and `en-US`, starting with the title screen.

The shape of the problem is already decided by the rest of the system. The engine emits codes, not
prose — `RejectReason` is an enum, `Event` is a discriminated union — and the client is what turns
them into sentences. The only party that knows what language the player reads is the browser. So
localization is a client concern, and the server keeps sending the same codes to everyone.

That leaves the choice of how: an i18n library (`i18next`, `@lingui`, `intl-messageformat`) or a
module of our own. The client is a Phaser game with two runtime dependencies, and the whole surface
to translate is a few dozen short strings with at most three placeholders each.

## Decision

**Localization is a module in the client, `frontend/src/i18n/`, with no external dependency.**

**The `pt-BR` catalog is the reference.** Its keys are the `MessageKey` type, and the other locales
are `Partial<Record<MessageKey, string>>`. A key that exists only in a translation is a compile
error. A key the locale has not translated yet resolves to the reference text, so a partially
translated client shows Portuguese where it has no English, never a blank or a key name.

**Keys are flat and prefixed by area** — `title.cta`, and `log.…`, `panel.…`, `map.…` as the rest of
the audit moves. Flat keys keep `MessageKey` a plain union with no type-level path recursion, and
the prefix is what lets a test assert the completeness of one area — the title, the area M3
completed — without pinning the others.

**Locale resolution is ordered: saved choice, then `navigator.languages`, then `en-US`.** Any `pt*`
tag opens in `pt-BR`; every other browser opens in en-US, which is the fallback the owner chose. The
choice is saved in `localStorage` under `eldritch-alley.locale`.

**Storage is best-effort and every access is wrapped in `try`/`catch`.** A browser with cookies
blocked throws on `localStorage`, and a private window can behave the same way. Losing the
remembered choice is acceptable; failing to open the client is not.

**The current locale is module state, resolved on first use.** `t(key, params?)` reads it, so a
screen never threads a locale through its call chain. Resolving lazily rather than at import keeps
`localStorage` and `navigator` out of import side effects, which is also what makes the module
testable in the node environment the frontend tests run in.

**Placeholders are `{name}` and are replaced by string interpolation.** A placeholder with no param
is left in place rather than replaced with `undefined`, so a gap is visible on the screen instead of
silently reading "undefined". There is no plural, gender or date formatting: the messages that need
them do not exist yet, and when they do they get their own decision.

## Consequences

- The server, the protocol and the engine do not change. A match sends `RejectReason` and `Event`
  codes to every client, whatever language its player reads.
- Class and unit names are not translated in either locale (owner's decision, 2026-10-04). They are
  proper nouns of the setting, so they stay out of the catalogs and never need an English value.
- The untranslated keys are visible rather than silent: `missingKeys(locale)` lists them, and a test
  reports the list without failing on it. For the title keys, which are the area M3 completed, that
  report is a failure instead — a gap there would be a title line showing up in Portuguese inside an
  English screen.
- Until the rest of the game is translated, a player who picks English gets an English title screen
  and a Portuguese match. That is the expected state of this feature, not a defect.
- A feature that needs plural rules, dates or number formats — a scoreboard, a timer readout — will
  not be served by this module as it stands and gets a new ADR that supersedes this one, rather than
  a quiet growth of `t()`.
