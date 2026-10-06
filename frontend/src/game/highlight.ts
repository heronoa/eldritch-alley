// The cells the state asks about: one area per state, and never two (EA-5, D1).
//
// Both areas are the engine's own answers — `reachableCells` for the cells a destination may be
// chosen from, `attackArea` for the cells a shot covers from where the unit stands — so a highlight
// can never disagree with what the server would accept (EA-1 D1, EA-2). An inspection (EA-6) replaces
// the question with its own: the area of the unit the secondary gesture named.
import { attackArea, reachableCells } from '@eldritch-alley/engine';
import type { PublicState, Team } from '../protocol';
import type { Cell } from '../view/grid';
import type { ActionMode } from './actions';

export interface HighlightInput {
  state: PublicState;
  selectedId: string | null;
  /**
   * The unit an inspection is asking about, or null when none is open (EA-6). It is optional because
   * a caller with no inspection on the screen is asking the state's own question, which is the common
   * case: an inspection is a gesture the player is holding, not a property of the match.
   */
  inspectedId?: string | null;
  mode: ActionMode;
  humanTeam: Team;
}

/** The two tones an area is drawn in: the movement one, and the attack one. */
export type HighlightTone = 'move' | 'attack';

/**
 * Which of the two areas this state paints, and so which tone it is drawn in. A state that is not
 * being inspected answers with its armed mode: the destinations while a destination is being chosen,
 * the attack area otherwise. An inspection is always the attack area — it asks about a unit's reach,
 * whoever that unit is and whatever the turn is doing (EA-6, D1). The scene takes the tone from here,
 * so one rule decides both which cells are painted and what colour they are, and the two cannot drift.
 */
export function highlightTone({
  inspectedId = null,
  mode,
}: Pick<HighlightInput, 'inspectedId' | 'mode'>): HighlightTone {
  if (inspectedId !== null) return 'attack';
  return mode === 'move' ? 'move' : 'attack';
}

/**
 * The area of the question this state is asking. While a destination is being chosen — the move mode
 * armed, nothing pending — that is where the unit can walk. While a move waits to be confirmed, and
 * while the attack is armed, that is what it can hit from the cell it stands on. An inspection asks
 * about another unit instead, and asks it alone: the two are never added up, because a highlight that
 * merged them would answer a question the game has not asked yet.
 */
function computeHighlightedCells({
  state,
  selectedId,
  inspectedId = null,
  mode,
  humanTeam,
}: HighlightInput): Cell[] {
  if (inspectedId !== null) {
    const inspected = state.units.find((unit) => unit.id === inspectedId);
    // A unit the state no longer has covers nothing: the inspection ended with it.
    if (inspected === undefined) return [];
    return attackArea(state, inspected.position, inspected);
  }

  const selected = state.units.find((unit) => unit.id === selectedId);
  // Only a unit of the player's own side, on its own turn, has an area to show.
  if (!selected || selected.defeated || selected.team !== humanTeam) return [];
  if (state.initiative[state.currentIndex] !== selected.id) return [];

  if (highlightTone({ mode }) === 'move') return reachableCells(state, selected.id);
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
  const key = `${input.selectedId}|${input.mode}|${input.humanTeam}|${input.inspectedId ?? null}`;

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
