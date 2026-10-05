// Title screen M1 — the seven walkers of the title, their paths and their timing, against the
// prototype's own `step()`.
import { describe, expect, it } from 'vitest';
import {
  WALKERS,
  WALK_SPEED,
  createWalker,
  positionOf,
  stepWalker,
  type Walker,
  type WalkerKey,
} from './walkers';

/** A random source that never stops the combatant. */
const NEVER = () => 0.9;
/** A random source that always stops it. */
const ALWAYS = () => 0.1;

/** The walker the prototype starts at `segment`, `fraction` of the way along it. */
function walkerAt(key: WalkerKey, segment: number, fraction: number): Walker {
  return { ...createWalker(key, NEVER), segment, fraction };
}

/** Checks where `createWalker` puts a class, without demanding an exact binary fraction. */
function expectStart(key: WalkerKey, segment: number, fraction: number): void {
  const walker = createWalker(key, NEVER);
  expect(walker.segment).toBe(segment);
  expect(walker.fraction).toBeCloseTo(fraction, 10);
}

/** `seconds` of walking, in the prototype's own 0.05 s frames. */
function walk(walker: Walker, seconds: number, random: () => number = NEVER): Walker {
  let out = walker;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) out = stepWalker(out, 0.05, random);
  return out;
}

describe('WALKERS', () => {
  it('gives all seven classes of v1 a path', () => {
    expect(Object.keys(WALKERS)).toHaveLength(7);
  });

  it('starts each walker where its offset says', () => {
    // The fraction is the offset's own remainder, so it carries the noise of `2.2 % 1`.
    expectStart('sniper', 0, 0);
    expectStart('wizard', 1, 0.5);
    expectStart('priest', 0, 0.6);
    expectStart('initiate', 2, 0.2);
    expectStart('adept', 2, 0.4);
    expectStart('vendor', 1, 0);
    expectStart('combatant', 3, 0.1);
  });

  it('leaves every walker walking, on its first lap', () => {
    for (const key of Object.keys(WALKERS) as WalkerKey[]) {
      expect(createWalker(key, NEVER)).toMatchObject({ state: 'walk', timer: 0, laps: 0 });
    }
  });
});

describe('stepWalker', () => {
  it('walks 0.9 cells per second', () => {
    expect(WALK_SPEED).toBe(0.9);
    // The initiate's third segment, (3,4) -> (7,4), is four cells long.
    const start = walkerAt('initiate', 2, 0);
    expect(positionOf(start)).toEqual({ x: 3, y: 4 });

    const moved = stepWalker(start, 0.5, NEVER);
    expect(positionOf(moved).x).toBeCloseTo(3 + 0.9 * 0.5, 10);
    expect(positionOf(moved).y).toBeCloseTo(4, 10);
  });

  it('reaches the next point after a whole unit segment', () => {
    // The initiate's second segment, (3,5) -> (3,4), is one cell long.
    const moved = stepWalker(walkerAt('initiate', 1, 0), 1 / WALK_SPEED, NEVER);
    expect(moved.segment).toBe(2);
    expect(moved.fraction).toBe(0);
    expect(positionOf(moved)).toEqual({ x: 3, y: 4 });
  });

  it('counts one lap per loop, and no more', () => {
    // The sniper's ring is four segments of three cells: 12 cells, 13.33 s at 0.9 cells a second.
    const afterOne = walk(createWalker('sniper', NEVER), 13.4);
    expect(afterOne.laps).toBe(1);
    expect(walk(afterOne, 13.4).laps).toBe(2);
  });

  it('sends the sniper to its reload on the second lap, not the first', () => {
    const afterOne = walk(createWalker('sniper', NEVER), 13.4);
    expect(afterOne).toMatchObject({ laps: 1, state: 'walk' });

    const afterTwo = walk(afterOne, 13.4);
    expect(afterTwo.laps).toBe(2);
    expect(afterTwo.state).toBe('act');
    expect(afterTwo.ambient).toBe('reload');
  });

  it('holds the walker in place for the whole 2.4 s of its action', () => {
    const acting = walk(walkerAt('combatant', 0, 0.99), 0.05, ALWAYS);
    expect(acting.state).toBe('act');
    const standing = positionOf(acting);

    const still = stepWalker(acting, 2.39, NEVER);
    expect(still.state).toBe('act');
    expect(positionOf(still)).toEqual(standing);

    const done = stepWalker(acting, 2.41, NEVER);
    expect(done.state).toBe('walk');
    expect(positionOf(done)).toEqual(standing);
  });

  it('stops the combatant on an odd segment only when the random source says so', () => {
    expect(walk(walkerAt('combatant', 0, 0.99), 0.05, ALWAYS).state).toBe('act');
    expect(walk(walkerAt('combatant', 0, 0.99), 0.05, NEVER).state).toBe('walk');
  });

  it('asks the random source for no other walker', () => {
    // Only the idle action draws on it, so the sniper walks on whatever it returns.
    expect(walk(walkerAt('sniper', 0, 0.99), 0.05, ALWAYS).state).toBe('walk');
  });

  it('turns the walker to the side it walks on screen', () => {
    // (7,5) -> (7,8) goes down and to the left on screen.
    expect(stepWalker(walkerAt('sniper', 0, 0), 0.05, NEVER).face).toBe(-1);

    // (7,8) -> (10,8) goes down and to the right, from a walker facing the other way.
    const leftward = { ...walkerAt('sniper', 1, 0), face: -1 as const };
    expect(stepWalker(leftward, 0.05, NEVER).face).toBe(1);
  });

  it('leaves the walker it is given alone', () => {
    const walker = createWalker('wizard', NEVER);
    const snapshot = { ...walker };

    const moved = stepWalker(walker, 0.05, NEVER);
    expect(moved).not.toBe(walker);
    expect(walker).toEqual(snapshot);
  });
});
