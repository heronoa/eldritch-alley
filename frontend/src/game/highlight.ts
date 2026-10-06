// The cells the armed mode would act on: one area per state, and never two (EA-5, D1).
//
// Both areas are the engine's own answers — `reachableCells` for the cells a destination may be
// chosen from, `attackArea` for the cells a shot covers from where the unit stands — so a highlight
// can never disagree with what the server would accept (EA-1 D1, EA-2).
import { attackArea, reachableCells } from '@eldritch-alley/engine';
import type { PublicState, Team } from '../protocol';
import type { Cell } from '../view/grid';
import type { ActionMode } from './actions';

export interface HighlightInput {
  state: PublicState;
  selectedId: string | null;
  mode: ActionMode;
  humanTeam: Team;
}

/**
 * Whether the area this state paints is the movement one — the destinations the unit may choose from
 * — or the attack one. The scene draws each in its own tone, so the tone comes from here too: one
 * rule decides both which cells are painted and what colour they are, and the two cannot drift.
 */
export function highlightsMovement(mode: ActionMode): boolean {
  return mode === 'move';
}

/**
 * The area of the question this state is asking. While a destination is being chosen — the move mode
 * armed, nothing pending — that is where the unit can walk. While a move waits to be confirmed, and
 * while the attack is armed, that is what it can hit from the cell it stands on. The two are never
 * added up: a highlight that merged them would answer a question the game has not asked yet.
 */
function computeHighlightedCells({ state, selectedId, mode, humanTeam }: HighlightInput): Cell[] {
  const selected = state.units.find((unit) => unit.id === selectedId);
  // Only a unit of the player's own side, on its own turn, has an area to show.
  if (!selected || selected.defeated || selected.team !== humanTeam) return [];
  if (state.initiative[state.currentIndex] !== selected.id) return [];

  if (highlightsMovement(mode)) return reachableCells(state, selected.id);
  if (mode === 'attack' || state.pendingMove !== null) {
    return attackArea(state, selected.position, selected);
  }
  return [];
}

/**
 * The answers already given for each state, by the state's identity: a state is never changed in
 * place, so the same state asked the same question has the same answer. A redraw asks again and again
 * (DT-74), and each ask walks every cell of the board. The map is dropped with the state.
 */
const answered = new WeakMap<PublicState, Map<string, Cell[]>>();

/**
 * Every cell the state's area covers. The array that comes back is shared by every caller asking the
 * same question: it must not be changed.
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
