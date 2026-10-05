// The English catalog. Partial on purpose: M3 writes the title screen's copy, and the rest of the
// game keeps falling back to `pt-BR` until its own feature translates it.
//
// A key that is not here is not an error — `message()` answers with the reference text. Adding a
// key that the reference does not define is one, and the type rejects it.

import type { MessageKey } from './catalog.pt-BR';

export const enUS: Partial<Record<MessageKey, string>> = {};
