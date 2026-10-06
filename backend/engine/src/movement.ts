// Where a unit may walk on this turn, and the cheapest way to each cell it can end on (ADR 0010).
//
// The server and the client both call this module (EA-1 D1), so the preview paints exactly the cells
// the engine accepts. It is pure and integer-only: the same state always gives the same paths, ties
// included, which is what makes a replay match the match it reproduces (ADR 0005).
import { inBounds, levelAt } from './board';
import type {
  Board,
  MovementProfile,
  Position,
  PublicState,
  Unit,
  UnitId,
  UnitState,
} from './types';

/** The rule the game had before a unit carried a profile: one level either way, a climb paid once. */
export const DEFAULT_MOVEMENT_PROFILE: MovementProfile = {
  maxStepUp: 1,
  maxStepDown: 1,
  climbCost: 1,
};

/** What the unit may climb. A setup is free to leave the profile out, and then the default applies. */
export function movementProfile(unit: Unit): MovementProfile {
  return unit.movementProfile ?? DEFAULT_MOVEMENT_PROFILE;
}

/** The levels one step rises (positive) or drops (negative). A flat step is zero. */
function climbBetween(board: Board, from: Position, to: Position): number {
  return levelAt(board, to) - levelAt(board, from);
}

/** Whether the profile allows one step: the level difference has to fit what it may climb and drop. */
export function stepAllowed(
  profile: MovementProfile,
  board: Board,
  from: Position,
  to: Position,
): boolean {
  const climb = climbBetween(board, from, to);
  return climb <= profile.maxStepUp && -climb <= profile.maxStepDown;
}

/** What one step costs: 1, plus the profile's price for each level climbed. A descent is free. */
export function stepCost(
  profile: MovementProfile,
  board: Board,
  from: Position,
  to: Position,
): number {
  return 1 + profile.climbCost * Math.max(0, climbBetween(board, from, to));
}

/** A step at the default profile, which is what a cell has cost since M1. */
export function moveCost(board: Board, from: Position, to: Position): number {
  return stepCost(DEFAULT_MOVEMENT_PROFILE, board, from, to);
}

/**
 * The eight neighbours, in the fixed order the search visits them: x first, then y. The order is what
 * breaks a tie between two routes of the same cost, so it is part of the determinism (ADR 0005).
 */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

/** A grid of one value per cell of the board, indexed `[y][x]`. The engine divides nothing (ADR 0005). */
function gridOf<T>(board: Board, value: T): T[][] {
  return Array.from({ length: board.height }, () => new Array<T>(board.width).fill(value));
}

/** The outcome of the search: what each cell costs, how it is entered, and which cells hold a unit. */
interface Walk {
  /** Cheapest cost to each cell, or -1 when the budget does not reach it. */
  readonly cost: readonly (readonly number[])[];
  /** The cell each reached cell is entered from, null at the cell the walk starts on. */
  readonly parent: readonly (readonly (Position | null)[])[];
  /** Every cell holding a unit, living or a body: none of them is a destination (D2). */
  readonly taken: readonly (readonly boolean[])[];
  /** The cell the unit stands on. */
  readonly start: Position;
}

/** The unit the state lets walk, or null when the id is not the one whose turn it is. */
function mover(state: PublicState, unitId: UnitId): UnitState | null {
  if (state.initiative[state.currentIndex] !== unitId) return null;
  return state.units.find((unit) => unit.id === unitId) ?? null;
}

/**
 * Dijkstra over the board, bounded by the movement left. A step costs 1 or 2, so one bucket per cost
 * is enough. A cell is written once: the first route to reach it is the one kept, and since the
 * neighbours are visited in a fixed order, that route is the same on every run.
 */
function walkFrom(state: PublicState, unit: UnitState): Walk {
  const board = state.board;
  const profile = movementProfile(unit);
  const budget = state.movementLeft;
  const cost = gridOf(board, -1);
  const parent = gridOf<Position | null>(board, null);
  const taken = gridOf(board, false);
  const blocked = gridOf(board, false);

  for (const other of state.units) {
    if (other.permanentlyDead) continue;
    taken[other.position.y][other.position.x] = true;
    // An ally's cell is walked through; an enemy's is not (D2).
    if (other.team !== unit.team) blocked[other.position.y][other.position.x] = true;
  }

  const start = { x: unit.position.x, y: unit.position.y };
  cost[start.y][start.x] = 0;

  // No step is longer than 2, so nothing is ever queued past the budget: the buckets go that far.
  const buckets: Position[][] = Array.from({ length: budget + 1 }, () => []);
  buckets[0].push(start);

  for (let spent = 0; spent <= budget; spent += 1) {
    for (const from of buckets[spent]) {
      // A cheaper route may have reached the cell after this entry was queued.
      if (cost[from.y][from.x] !== spent) continue;

      for (const [dx, dy] of NEIGHBOURS) {
        const to = { x: from.x + dx, y: from.y + dy };
        if (!inBounds(board, to)) continue;
        if (blocked[to.y][to.x]) continue;
        if (!stepAllowed(profile, board, from, to)) continue;

        const arriving = spent + stepCost(profile, board, from, to);
        if (arriving > budget) continue;
        // The first route to a cell wins, which is what keeps the tie-break fixed.
        if (cost[to.y][to.x] !== -1) continue;

        cost[to.y][to.x] = arriving;
        parent[to.y][to.x] = from;
        buckets[arriving].push(to);
      }
    }
  }

  return { cost, parent, taken, start };
}

/** One walk the engine found: the cells in the order they are stepped on, and what they cost. */
export interface WalkedPath {
  /** From the first step to the destination, the cell it ends on included. */
  path: Position[];
  cost: number;
}

/**
 * Every cell the unit may end this turn on: the cells a path fits in the movement left, minus the one
 * it stands on and the ones a unit holds. Empty when the id is not the unit whose turn it is (D2).
 */
export function reachableCells(state: PublicState, unitId: UnitId): Position[] {
  const unit = mover(state, unitId);
  if (unit === null) return [];

  const walk = walkFrom(state, unit);
  const cells: Position[] = [];
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      if (walk.taken[y][x] || walk.cost[y][x] < 0) continue;
      if (x === walk.start.x && y === walk.start.y) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * The cheapest walk to a cell, or null when the movement left does not reach it. The destination has
 * to be free: an ally's cell is walked through but never ended on, and an enemy's is not entered.
 */
export function findPath(state: PublicState, unitId: UnitId, to: Position): WalkedPath | null {
  if (!inBounds(state.board, to)) return null;

  const unit = mover(state, unitId);
  if (unit === null) return null;

  const walk = walkFrom(state, unit);
  if (walk.taken[to.y][to.x] || walk.cost[to.y][to.x] < 0) return null;
  // The cell the unit stands on is not a destination: a move that changes nothing is not a move.
  if (to.x === walk.start.x && to.y === walk.start.y) return null;

  // Walk the chain of cells each one is entered from, back to the cell the unit stands on.
  const path: Position[] = [];
  let cell: Position | null = { x: to.x, y: to.y };
  while (cell !== null && (cell.x !== walk.start.x || cell.y !== walk.start.y)) {
    path.push(cell);
    cell = walk.parent[cell.y][cell.x];
  }
  path.reverse();
  return { path, cost: walk.cost[to.y][to.x] };
}
