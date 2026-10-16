// Title screen M1 — the ambient actions of the walkers: the frames, the fade, the effects and the
// prototype's two blinks.
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_DURATION_S,
  ambientEffect,
  ambientFade,
  ambientFrame,
  amuletBlinkOn,
  bottleAt,
  scopeGlintOn,
} from './ambient';

describe('AMBIENT_DURATION_S', () => {
  it('is the 2.4 s the walkers hold, as `stepWalker` does', () => {
    expect(AMBIENT_DURATION_S).toBe(2.4);
  });
});

describe('ambientFrame', () => {
  it('drops the sniper to the idle pose outside the reload', () => {
    expect(ambientFrame('reload', 0.2)).toBeNull();
    expect(ambientFrame('reload', 2.1)).toBeNull();
    expect(ambientFrame('reload', 2.5)).toBeNull();
  });

  it('shows the reload in two frames', () => {
    expect(ambientFrame('reload', 0.5)).toBe(8);
    expect(ambientFrame('reload', 1.5)).toBe(9);
  });

  it('alternates the two frames of a meditation every 0.22 s', () => {
    expect(ambientFrame('meditate-arcane', 0.1)).toBe(8);
    expect(ambientFrame('meditate-arcane', 0.3)).toBe(9);
    expect(ambientFrame('meditate-faith', 0.1)).toBe(8);
    expect(ambientFrame('meditate-faith', 0.3)).toBe(9);
  });

  it('shows the hand of the vendor, and then no pose of its own', () => {
    expect(ambientFrame('throw', 0.1)).toBeNull();
    expect(ambientFrame('throw', 0.3)).toBe(6);
    expect(ambientFrame('throw', 0.8)).toBe(7);
    expect(ambientFrame('throw', 1.5)).toBeNull();
  });

  it('breathes the idle pose in two frames', () => {
    expect(ambientFrame('idle', 0.1)).toBe(0);
    expect(ambientFrame('idle', 0.7)).toBe(1);
  });
});

describe('ambientFade', () => {
  it('fades in over 0.3 s, holds, and fades out over 0.3 s', () => {
    expect(ambientFade(0)).toBeCloseTo(0, 10);
    expect(ambientFade(0.15)).toBeCloseTo(0.5, 10);
    expect(ambientFade(1.2)).toBeCloseTo(1, 10);
    expect(ambientFade(2.4)).toBeCloseTo(0, 10);
  });

  it('never leaves the 0..1 the effects multiply by', () => {
    for (let timer = -1; timer <= 3; timer += 0.05) {
      expect(ambientFade(timer)).toBeGreaterThanOrEqual(0);
      expect(ambientFade(timer)).toBeLessThanOrEqual(1);
    }
  });
});

describe('ambientEffect', () => {
  it('gives each action the effect the prototype draws', () => {
    expect(ambientEffect('meditate-arcane')).toBe('magic-circle');
    expect(ambientEffect('meditate-faith')).toBe('light-beam');
    expect(ambientEffect('reload')).toBe('reload-magazine');
    expect(ambientEffect('throw')).toBe('bottle');
    expect(ambientEffect('idle')).toBeNull();
  });
});

describe('bottleAt', () => {
  it('is in the hand before the throw and gone after it', () => {
    expect(bottleAt(0.4)).toBeNull();
    expect(bottleAt(1.5)).toBeNull();
  });

  it('flies for 0.6 s', () => {
    expect(bottleAt(0.5)?.t).toBeCloseTo(0, 10);
    expect(bottleAt(0.8)?.t).toBeCloseTo(0.5, 10);
  });

  it('shatters for 0.3 s', () => {
    expect(bottleAt(1.2)?.t).toBeCloseTo(1 / 3, 10);
    expect(bottleAt(1.4)).toBeNull();
  });
});

describe('the prototype blinks', () => {
  it('glints the scope of the sniper one moment in four', () => {
    expect(scopeGlintOn(0)).toBe(true);
    expect(scopeGlintOn(0.9)).toBe(false);
    expect(scopeGlintOn(3.7)).toBe(true);
  });

  it('lights the amulet of the vendor one moment in six', () => {
    expect(amuletBlinkOn(0)).toBe(true);
    expect(amuletBlinkOn(0.7)).toBe(false);
    expect(amuletBlinkOn(4.3)).toBe(true);
  });
});
