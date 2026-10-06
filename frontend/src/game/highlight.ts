// The cells the armed mode would act on. Derived from `resolveClick` rather than from a second copy
// of the engine's rules, so the highlight and the click can never disagree.
import type { PublicState, Team } from '../protocol';
import type { Cell } from '../view/grid';
import type { ActionMode } from './actions';
import { allowsIntent, resolveClick, type Intent } from './selection';

function boardCells(state: PublicState): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) cells.push({ x, y });
  }
  return cells;
}

export interface HighlightInput {
  state: PublicState;
  selectedId: string | null;
  mode: ActionMode;
  humanTeam: Team;
}

/** Whether a click on the cell would act with the armed kind. Picking a unit is not acting on a cell. */
function actsOn(intent: Intent, mode: ActionMode): boolean {
  if (intent.kind === 'select' || intent.kind === 'none') return false;
  return mode !== 'inspect' && allowsIntent(mode, intent);
}

function computeHighlightedCells({ state, selectedId, mode, humanTeam }: HighlightInput): Cell[] {
  if (mode === 'inspect' || selectedId === null) return [];

  const cells: Cell[] = [];
  for (const cell of boardCells(state)) {
    const intent = resolveClick({ state, selectedId, cell, humanTeam });
    if (actsOn(intent, mode)) cells.push(cell);
  }
  return cells;
}

/**
 * The answers already given for each state, by the state's identity: a state is never changed in
 * place, so the same state asked the same question has the same answer. A redraw asks again and again
 * (DT-74), and each ask walks every cell of the board. The map is dropped with the state.
 */
const answered = new WeakMap<PublicState, Map<string, Cell[]>>();

/**
 * Every cell a click would act on with the armed kind. Nothing is armed in `inspect`. The array that
 * comes back is shared by every caller asking the same question: it must not be changed.
 */
export function highlightedCells(input: HighlightInput): Cell[] {
  const key = `${input.selectedId}|${input.mode}|${input.humanTeam}`;

  let byQuestion = answered.get(input.state);
  if (byQuestion === undefined) {
    byQuestion = new Map();
    answered.set(input.state, byQuestion);
  }

  const known = byQuestion.get(key);
  if (known !== undefined) return known;

  const cells = computeHighlightedCells(input);
  byQuestion.set(key, cells);
  return cells;
}
