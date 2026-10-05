// Title screen M1 — the seven walkers of the title: where each class walks, how fast, and when it
// stops to do something. The prototype's `step()`, with the random draw passed in so a test can fix
// it and the caller can share one source with the rest of the screen.
import { AMBIENT_DURATION_S, type AmbientKind } from './ambient';

/** A point of the city, `[x, y]` in cells. The prototype's own pairs, in the prototype's order. */
export type Cell = readonly [number, number];

/** Every class of the v1 roster. All seven walk the title. */
export type WalkerKey =
  | 'sniper'
  | 'wizard'
  | 'priest'
  | 'initiate'
  | 'adept'
  | 'vendor'
  | 'combatant';

/** One walker: the lap it is on, how far along it is, and what it is doing right now. */
export interface Walker {
  readonly key: WalkerKey;
  readonly points: readonly Cell[];
  /** Which segment of the path it is on. */
  segment: number;
  /** How far along that segment, 0 to 1. */
  fraction: number;
  /** The side it shows: `1` when its segment reads left to right on screen, `-1` otherwise. */
  face: 1 | -1;
  state: 'walk' | 'act';
  /** How long the current action has run, in seconds. Only the action reads it. */
  timer: number;
  laps: number;
  ambient: AmbientKind | null;
}

/** Cells per second, for every walker. */
export const WALK_SPEED = 0.9;

/** The square the sniper, the adept and the combatant share, in the middle of the two streets. */
const RING: readonly Cell[] = [
  [7, 5],
  [7, 8],
  [10, 8],
  [10, 5],
];

/**
 * Where each class walks, where it starts along that path (`offset`, in cells), how many laps it
 * walks between two actions, and which action it plays.
 */
export const WALKERS: Record<
  WalkerKey,
  { points: readonly Cell[]; offset: number; every: number; ambient: AmbientKind }
> = {
  sniper: { points: RING, offset: 0, every: 2, ambient: 'reload' },
  wizard: {
    points: [
      [7, 8],
      [7, 11],
      [3, 11],
      [3, 9],
      [7, 9],
    ],
    offset: 1.5,
    every: 1,
    ambient: 'meditate-arcane',
  },
  priest: {
    points: [
      [10, 5],
      [10, 8],
      [13, 8],
      [13, 5],
    ],
    offset: 0.6,
    every: 2,
    ambient: 'meditate-faith',
  },
  initiate: {
    points: [
      [7, 5],
      [3, 5],
      [3, 4],
      [7, 4],
    ],
    offset: 2.2,
    every: 2,
    ambient: 'meditate-arcane',
  },
  adept: { points: RING, offset: 2.4, every: 3, ambient: 'meditate-faith' },
  vendor: {
    points: [
      [10, 8],
      [10, 12],
      [11, 12],
      [11, 8],
    ],
    offset: 1,
    every: 2,
    ambient: 'throw',
  },
  combatant: {
    points: [
      [7, 8],
      [10, 8],
      [10, 5],
      [7, 5],
    ],
    offset: 3.1,
    every: 3,
    ambient: 'idle',
  },
};

/**
 * The walker the prototype puts on the street: on the segment its offset falls in, walking.
 *
 * Where a walker starts is a decision of the path, not a draw, so `random` goes unused here. It
 * stays in the signature because it is the same source `stepWalker` takes, and the caller keeps one.
 */
export function createWalker(key: WalkerKey, random: () => number): Walker {
  void random;
  const { points, offset, ambient } = WALKERS[key];
  return {
    key,
    points,
    segment: Math.floor(offset) % points.length,
    fraction: offset % 1,
    face: 1,
    state: 'walk',
    timer: 0,
    laps: 0,
    ambient,
  };
}

/** Where the walker stands, in cells, at the fraction of its segment it has walked. */
export function positionOf(walker: Walker): { x: number; y: number } {
  const from = walker.points[walker.segment];
  const to = nextPoint(walker.points, walker.segment);
  return {
    x: from[0] + (to[0] - from[0]) * walker.fraction,
    y: from[1] + (to[1] - from[1]) * walker.fraction,
  };
}

/** The walker one frame later. `dt` is in seconds, clamped by the caller to the prototype's 0.05. */
export function stepWalker(walker: Walker, dt: number, random: () => number): Walker {
  if (walker.state === 'act') {
    const timer = walker.timer + dt;
    return timer > AMBIENT_DURATION_S
      ? { ...walker, state: 'walk', timer: 0 }
      : { ...walker, timer };
  }

  const { points, every, ambient } = WALKERS[walker.key];
  const walked = walker.fraction + (WALK_SPEED * dt) / segmentLength(points, walker.segment);

  let segment = walker.segment;
  let fraction = walked;
  let laps = walker.laps;
  let state: Walker['state'] = 'walk';

  if (walked >= 1) {
    // The prototype drops what is left of the step: a segment is walked in whole frames.
    fraction = 0;
    segment = (segment + 1) % points.length;
    if (segment === 0) laps += 1;

    if (segment === 0 && laps % every === 0 && ambient !== 'idle') {
      state = 'act';
    } else if (segment % 2 === 1 && ambient === 'idle' && random() < 0.5) {
      state = 'act';
    }
  }

  return {
    ...walker,
    segment,
    fraction,
    laps,
    state,
    timer: 0,
    face: faceOf(points, segment, walker.face),
  };
}

/** The point a walker on `segment` is walking towards. The paths are closed loops. */
function nextPoint(points: readonly Cell[], segment: number): Cell {
  return points[(segment + 1) % points.length];
}

/** How far a walker on `segment` has to walk, in cells. Zero only for a path that repeats a point. */
function segmentLength(points: readonly Cell[], segment: number): number {
  const from = points[segment];
  const to = nextPoint(points, segment);
  return Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
}

/**
 * The side the walker shows on its segment. The prototype reads the screen, not the map: a step that
 * moves the sprite right is `1`, and one that does not move it sideways at all leaves the walker
 * facing the way it already faced.
 */
function faceOf(points: readonly Cell[], segment: number, face: 1 | -1): 1 | -1 {
  const from = points[segment];
  const to = nextPoint(points, segment);
  const sideways = to[0] - from[0] - (to[1] - from[1]);
  if (sideways === 0) return face;
  return sideways > 0 ? 1 : -1;
}
