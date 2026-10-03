// The cells the armed mode would act on. Derived from `resolveClick` rather than from a second copy
// of the engine's rules, so the highlight and the click can never disagree.
import type { PublicState, Team } from '../protocol';
import type { Cell } from '../view/grid';
import type { ActionMode } from './actions';
import { resolveClick } from './selection';

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

/** Every cell a click would answer with a `send` of the armed kind. Nothing is armed in `inspect`. */
export function highlightedCells({ state, selectedId, mode, humanTeam }: HighlightInput): Cell[] {
  if (mode === 'inspect' || selectedId === null) return [];

  const cells: Cell[] = [];
  for (const cell of boardCells(state)) {
    const intent = resolveClick({ state, selectedId, cell, humanTeam });
    if (intent.kind === 'send' && intent.action.type === mode) cells.push(cell);
  }
  return cells;
}
