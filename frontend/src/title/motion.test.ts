// Title screen M1 — what the title is allowed to move, for a player who asked for less motion.
import { describe, expect, it } from 'vitest';
import { motionPolicy } from './motion';

describe('motionPolicy', () => {
  it('runs everything when the player allows motion', () => {
    expect(motionPolicy(false)).toEqual({
      walkers: true,
      ambient: true,
      stampScale: true,
      speed: 1,
    });
  });

  it('stops the walkers, the ambient actions and the slam when the player asked for less', () => {
    expect(motionPolicy(true)).toEqual({
      walkers: false,
      ambient: false,
      stampScale: false,
      speed: 0,
    });
  });
});
