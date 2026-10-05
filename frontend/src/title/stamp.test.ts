// Title screen M1 — the stamp timeline: the 180 ms slam, the 1600 ms the stamp is up, and the fade.
import { describe, expect, it } from 'vitest';
import { STAMP_SLAM_MS, STAMP_VISIBLE_MS, stampAt } from './stamp';

describe('the two durations', () => {
  it('are the slam and the hold the prototype gives them', () => {
    expect(STAMP_SLAM_MS).toBe(180);
    expect(STAMP_VISIBLE_MS).toBe(1600);
  });
});

describe('stampAt', () => {
  it('is hidden before the press', () => {
    expect(stampAt(-1).visible).toBe(false);
    expect(stampAt(-0.01).visible).toBe(false);
  });

  it('slams from 1.6 down to 1 over 180 ms, fading in as it lands', () => {
    expect(stampAt(0)).toMatchObject({ visible: true });
    expect(stampAt(0).scale).toBeCloseTo(1.6, 10);
    expect(stampAt(0).opacity).toBeCloseTo(0, 10);

    expect(stampAt(90).scale).toBeCloseTo(1.3, 10);
    expect(stampAt(90).opacity).toBeCloseTo(0.5, 10);

    expect(stampAt(STAMP_SLAM_MS)).toMatchObject({ scale: 1, opacity: 1, visible: true });
  });

  it('stays whole and visible until its time is up', () => {
    expect(stampAt(1000)).toEqual({ scale: 1, opacity: 1, visible: true });
    expect(stampAt(STAMP_VISIBLE_MS)).toEqual({ scale: 1, opacity: 1, visible: true });
  });

  it('fades out over 180 ms and is gone', () => {
    expect(stampAt(1690).scale).toBe(1);
    expect(stampAt(1690).opacity).toBeCloseTo(0.5, 10);
    expect(stampAt(1690).visible).toBe(true);

    expect(stampAt(STAMP_VISIBLE_MS + STAMP_SLAM_MS).visible).toBe(false);
    expect(stampAt(2000).visible).toBe(false);
  });

  it('drops the slam under reduced motion, keeping the fade on the same clock', () => {
    for (const elapsed of [0, 90, 179, 180, 1000, 1690]) {
      expect(stampAt(elapsed, false).scale).toBe(1);
    }

    expect(stampAt(0, false).visible).toBe(true);
    expect(stampAt(0, false).opacity).toBeCloseTo(0, 10);
    expect(stampAt(90, false).opacity).toBeCloseTo(0.5, 10);
    expect(stampAt(1690, false).opacity).toBeCloseTo(0.5, 10);
  });
});
