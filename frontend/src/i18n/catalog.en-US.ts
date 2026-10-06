// The English catalog. Partial on purpose: M3 wrote the title screen's copy — this feature's whole
// translation — and the rest of the game keeps falling back to `pt-BR` until its own feature
// translates it. That is why a player who picks EN and starts a match plays it in Portuguese.
//
// The copy is a drafted translation, not a literal one (decision 10 of the plan): the title's tone
// is noir and deliberate, so the sentences were written again in English rather than carried over
// word by word. The setting keeps its own names in either language: Belém, Rua do Comércio, Praça
// Municipal are where the story happens.
//
// A key that is not here is not an error — `message()` answers with the reference text. Adding a
// key that the reference does not define is one, and the type rejects it.

import type { MessageKey } from './catalog.pt-BR';

export const enUS: Partial<Record<MessageKey, string>> = {
  // The title screen. `name`, `stampTag`, `footerVersion` and `document` are the same in both
  // locales: the game's name is not translated, and the version is a number.
  'title.document': 'Eldritch Alley: Tactics',
  'title.meta': 'BUREAU OF OCCULT AFFAIRS · INCIDENT NO. 2026/0001',
  'title.name': 'Eldritch Alley',
  'title.stampTag': 'TACTICS',
  'title.tagline':
    'Licensed agents, unlicensed magic, and a whole city of alleys. Assemble your squad and respond to the incident.',
  'title.cta': 'Start match',
  'title.ctaBusy': 'Connecting…',
  'title.hint': 'or press Enter',
  'title.granted': 'MATCH AUTHORIZED',
  'title.unavailable': 'Server unavailable',
  'title.occupied': 'You already have a match open in another tab',
  'title.loadFailed': 'The match could not be loaded',
  'title.notice.refused': 'ACCESS REFUSED',
  'title.notice.loadFailed': 'FAILED TO LOAD',
  'title.notice.close': 'Close',
  'title.footerVersion': 'v0.1',
  'title.footerPlace': 'Belém · the small hours',
  'title.language': 'Language',

  // The battle log's refusals the game itself adds: a blocked shot, and a destination no walk reaches.
  'log.rejection.no-line-of-sight': 'No line of sight',
  'log.rejection.no-path': 'No path',
};
