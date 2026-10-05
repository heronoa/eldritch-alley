// The unit panel: what the state can say about one unit, as rows the scene draws verbatim.
//
// `movementLeft` and `hasActed` describe only the unit that has the turn, so a unit that is not the
// actor gets `—` instead of a number that belongs to somebody else. Reaction (ADR 0007) and mana
// (ADR 0002) are M3: their rows exist and are dimmed, so the panel does not change shape when the
// rules land.
//
// The labels and the two words a turn row can show come from the catalog, keyed by the `PanelKey`
// itself. The `—` of a row with no value is a mark, not a sentence, so it stays here.
import { t } from '../i18n';
import type { PublicState, UnitState } from '../protocol';

export type PanelKey = 'hp' | 'movement' | 'action' | 'ammo' | 'reaction' | 'mana';

/** A row's label, from the catalog. The key is the panel key, so a new row cannot lack one. */
function labelOf(key: PanelKey): string {
  return t(`panel.label.${key}`);
}

/** What a row shows when it has no value. A mark, not a sentence, so it has no entry in the catalog. */
const NO_VALUE = '—';

export interface PanelRow {
  key: PanelKey;
  /** What the row is called, in the language of the client. */
  label: string;
  value: string;
  /** How full the row's bar is, 0..1, or null when the row carries no bar. */
  fill: number | null;
  /** False marks a placeholder: drawn dimmed, never a control. */
  enabled: boolean;
}

/** A row the engine answers for. */
function row(key: PanelKey, value: string, fill: number | null): PanelRow {
  return { key, label: labelOf(key), value, fill, enabled: true };
}

/** A row nothing can answer yet, drawn dimmed. */
function placeholder(key: PanelKey): PanelRow {
  return { key, label: labelOf(key), value: NO_VALUE, fill: null, enabled: false };
}

/** The share of a whole, or null when the whole is missing or empty. */
function fraction(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/**
 * The two rows that describe the turn itself. Only the unit on turn has a movement budget and an
 * action to spend; for anybody else the rows are present but say nothing.
 */
function turnRows(state: PublicState, unit: UnitState, isActor: boolean): PanelRow[] {
  if (!isActor) {
    return [row('movement', NO_VALUE, null), row('action', NO_VALUE, null)];
  }

  return [
    row('movement', `${state.movementLeft}/${unit.movement}`, fraction(state.movementLeft, unit.movement)),
    row('action', t(state.hasActed ? 'panel.value.spent' : 'panel.value.available'), null),
  ];
}

/** The rows of one unit, in drawing order. An unknown or absent unit has no rows. */
export function unitPanel(state: PublicState, unitId: string | null): PanelRow[] {
  if (unitId === null) return [];

  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return [];

  const isActor = state.initiative[state.currentIndex] === unit.id;

  const ammo =
    unit.magazine === null
      ? row('ammo', NO_VALUE, null)
      : row('ammo', `${unit.ammo}/${unit.magazine}`, fraction(unit.ammo, unit.magazine));

  return [
    row('hp', `${unit.health}/${unit.maxHealth}`, fraction(unit.health, unit.maxHealth)),
    ...turnRows(state, unit, isActor),
    ammo,
    placeholder('reaction'),
    placeholder('mana'),
  ];
}
