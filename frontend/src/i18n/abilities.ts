// The word a catalog gives an ability's id (EA-16). The engine never learns a name (ADR 0016 §13): the
// id is an opaque string a unit's own slots are read for, so the map from that id to a word lives here,
// in the one layer that owns the player's language (ADR 0009).
//
// The catalog travels with the match (ADR 0016 §3), so a server can ship an ability this build has no
// word for. `abilityName` answers null then and the caller falls back — the menu names the row by the id
// itself, and the log keeps its generic sentence — rather than printing a word nobody wrote.
import type { MessageKey } from './catalog.pt-BR';
import { t } from './translate';

/** The ids this build can name, and the catalog key each one reads. */
const NAME_KEYS: Readonly<Record<string, MessageKey>> = {
  'piercing-shot': 'ability.piercing-shot',
  fireball: 'ability.fireball',
  'area-heal': 'ability.area-heal',
};

/** The catalog's word for an ability id, or null when this build has no word for it. */
export function abilityName(id: string): string | null {
  const key = NAME_KEYS[id];
  return key === undefined ? null : t(key);
}
