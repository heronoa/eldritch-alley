// The unit inspection window: the sheet a right-click on a unit opens (EA-6, extended by the smoke
// test 2 feedback). It is a question, not a control — it sends no action, changes no turn and selects
// nobody (EA-6, D2) — so everything it needs is the public state and the unit it was asked about.
//
// The rows are the owner's own list (Q5): the health over its ceiling, the resource the class carries,
// the most the unit can walk in one turn, and how many reactions it has. Nothing else is shown.
//
// The movement is the unit's own `movement`, not the turn's `movementLeft`: this is a sheet of what a
// unit is, and a unit that is not on turn still has a movement. The reaction count reads the one slot
// the engine gives a unit (`abilities.reaction`); a count above one needs an engine change first.
import { t } from '../i18n';
import type { PublicState, UnitState } from '../protocol';

/** The four rows of the sheet, which is all the window has to hold. */
export type InspectKey = 'hp' | 'resource' | 'movement' | 'reaction';

export interface InspectRow {
  key: InspectKey;
  /** What the row is called, in the language of the client. */
  label: string;
  value: string;
}

export interface UnitSheet {
  /** The heading of the window, which is what the close button sits on. */
  title: string;
  rows: readonly InspectRow[];
}

/** What a row shows when the engine cannot answer it yet. The panel model's own mark, and no sentence. */
const NO_VALUE = '—';

function row(key: InspectKey, label: string, value: string): InspectRow {
  return { key, label, value };
}

/**
 * The resource row: the ammunition of a class that carries a magazine, or its mana for one that does
 * not. The engine has no mana yet (ADR 0002, DT-57), so that row says what the panel's own row says.
 */
function resourceRow(unit: UnitState): InspectRow {
  if (unit.magazine === null) return row('resource', t('panel.label.mana'), NO_VALUE);
  return row('resource', t('panel.label.ammo'), `${unit.ammo}/${unit.magazine}`);
}

/** The sheet of one unit, or null when there is nothing to show. */
export function unitSheet(state: PublicState, unitId: string | null): UnitSheet | null {
  if (unitId === null) return null;

  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return null;

  return {
    title: t('inspect.title'),
    rows: [
      row('hp', t('panel.label.hp'), `${unit.health}/${unit.maxHealth}`),
      resourceRow(unit),
      row('movement', t('panel.label.movement'), `${unit.movement}`),
      row('reaction', t('panel.label.reaction'), `${unit.abilities.reaction === null ? 0 : 1}`),
    ],
  };
}
