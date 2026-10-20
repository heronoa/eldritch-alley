import { describe, expect, it } from 'vitest';
import type { Cue } from './presentation';
import { stepDurationMs, stepWaitMs } from './cueTiming';
import { ATTACK_TIMELINE, MOVE_MS_PER_CELL, RELOAD_TIMELINE } from '../view/animation';
import { BANNER_DURATION_MS } from './banner';
import type { Effect } from '../view/effects';

const EFFECT: Effect = { kind: 'pistol-flash', travelMs: 0, color: 0, staggerMs: 0 };

describe('stepDurationMs', () => {
  it('is zero for a step with no cues at all, like a plain turn-ended', () => {
    expect(stepDurationMs([])).toBe(0);
  });

  it('is zero for a defeat or a removal: an instant flip of what is already drawn', () => {
    expect(stepDurationMs([{ kind: 'defeat', unitId: 'u1' }])).toBe(0);
    expect(stepDurationMs([{ kind: 'remove', unitId: 'u1' }])).toBe(0);
  });

  it('is the walk duration for a move, one cell at a time (view/animation.ts)', () => {
    const cue: Cue = {
      kind: 'move',
      unitId: 'u1',
      from: { x: 0, y: 0 },
      to: { x: 2, y: 0 },
      steps: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    };

    expect(stepDurationMs([cue])).toBe(2 * MOVE_MS_PER_CELL);
  });

  it('is the full attack recovery, win or miss, so the next step never cuts off the swing', () => {
    const hit: Cue = { kind: 'attack', actorId: 'a', targetId: 'b', style: 'melee', hit: true, effect: EFFECT };
    const miss: Cue = { ...hit, hit: false };

    expect(stepDurationMs([hit])).toBe(ATTACK_TIMELINE.recover);
    expect(stepDurationMs([miss])).toBe(ATTACK_TIMELINE.recover);
  });

  it('is the reload timeline end for a reload', () => {
    const cue: Cue = { kind: 'reload', unitId: 'u1', from: 0, to: 3 };

    expect(stepDurationMs([cue])).toBe(RELOAD_TIMELINE.end);
  });

  it('takes the slowest cue of the step, not the sum of all of them', () => {
    const move: Cue = {
      kind: 'move',
      unitId: 'u1',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      steps: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    };
    const attack: Cue = { kind: 'attack', actorId: 'u1', targetId: 'b', style: 'ranged', hit: true, effect: EFFECT };

    expect(stepDurationMs([move, attack])).toBe(ATTACK_TIMELINE.recover);
  });
});

describe('stepWaitMs', () => {
  it('holds a pure skip of the bot\'s turn on screen for the length of a banner (M4 playtest fix, P2)', () => {
    expect(stepWaitMs([], 'B', 'A')).toBe(BANNER_DURATION_MS);
  });

  it('never adds a wait to the human\'s own deliberate end of turn, cues or not', () => {
    expect(stepWaitMs([], 'A', 'A')).toBe(0);
  });

  it('adds no wait when there is nothing on turn at all, such as the join or a reconnect', () => {
    expect(stepWaitMs([], null, 'A')).toBe(0);
  });

  it('is the ordinary cue duration whenever there is something to show', () => {
    const cue: Cue = { kind: 'reload', unitId: 'u1', from: 0, to: 3 };

    expect(stepWaitMs([cue], 'B', 'A')).toBe(RELOAD_TIMELINE.end);
  });
});
