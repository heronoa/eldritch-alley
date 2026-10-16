import { describe, expect, it } from 'vitest';
import {
  ATTACK_TIMELINE,
  IDLE_STEP_MS,
  MOVE_MS_PER_CELL,
  RELOAD_TIMELINE,
  WALK_STEP_MS,
  attackFrame,
  filledPipsAt,
  idleFrame,
  movementDuration,
  reloadFrame,
  walkFrame,
} from './animation';

describe('attackFrame', () => {
  it('is idle before the windup', () => {
    expect(attackFrame(0)).toBe(0);
    expect(attackFrame(249)).toBe(0);
  });

  it('shows the windup frame from 250 to 519', () => {
    expect(attackFrame(250)).toBe(1);
    expect(attackFrame(519)).toBe(1);
  });

  it('shows the strike frame from 520 to 759', () => {
    expect(attackFrame(520)).toBe(2);
    expect(attackFrame(759)).toBe(2);
  });

  it('is idle again through the whole recovery', () => {
    expect(attackFrame(760)).toBe(0);
    expect(attackFrame(1999)).toBe(0);
    expect(attackFrame(2000)).toBe(0);
  });
});

describe('reloadFrame', () => {
  it('is idle before the action starts', () => {
    expect(reloadFrame(0)).toBe(0);
    expect(reloadFrame(299)).toBe(0);
  });

  it('shows the first frame from 300 to 759', () => {
    expect(reloadFrame(300)).toBe(1);
    expect(reloadFrame(759)).toBe(1);
  });

  it('shows the second frame from 760 to 1179', () => {
    expect(reloadFrame(760)).toBe(2);
    expect(reloadFrame(1179)).toBe(2);
  });

  it('is idle again once the action ends', () => {
    expect(reloadFrame(1180)).toBe(0);
    expect(reloadFrame(5000)).toBe(0);
  });
});

describe('filledPipsAt', () => {
  it('keeps the magazine as it was before the refill starts', () => {
    expect(filledPipsAt(0, 0, 3)).toBe(0);
    expect(filledPipsAt(759, 0, 3)).toBe(0);
  });

  it('has not refilled anything at the exact moment the refill starts', () => {
    expect(filledPipsAt(760, 0, 3)).toBe(0);
  });

  it('refills one pip every 140 ms from 760', () => {
    expect(filledPipsAt(760 + 140, 0, 3)).toBe(1);
    expect(filledPipsAt(760 + 280, 0, 3)).toBe(2);
    expect(filledPipsAt(760 + 420, 0, 3)).toBe(3);
  });

  it('starts from the ammunition that is still in the magazine', () => {
    expect(filledPipsAt(0, 1, 3)).toBe(1);
    expect(filledPipsAt(760 + 140, 1, 3)).toBe(2);
  });

  it('never goes past the size of the magazine', () => {
    expect(filledPipsAt(760 + 4200, 0, 3)).toBe(3);
  });
});

describe('walkFrame', () => {
  it('alternates every 150 ms starting on the first frame', () => {
    expect(walkFrame(0)).toBe(1);
    expect(walkFrame(149)).toBe(1);
    expect(walkFrame(150)).toBe(2);
    expect(walkFrame(299)).toBe(2);
    expect(walkFrame(300)).toBe(1);
  });
});

describe('idleFrame', () => {
  it('alternates every 500 ms starting on the first frame', () => {
    expect(idleFrame(0)).toBe(1);
    expect(idleFrame(499)).toBe(1);
    expect(idleFrame(500)).toBe(2);
    expect(idleFrame(999)).toBe(2);
    expect(idleFrame(1000)).toBe(1);
  });
});

describe('movementDuration', () => {
  it('spends 120 ms per cell', () => {
    expect(movementDuration(3)).toBe(360);
    expect(movementDuration(0)).toBe(0);
  });

  it('refuses a distance that is not a whole number of cells', () => {
    expect(() => movementDuration(-1)).toThrow(RangeError);
    expect(() => movementDuration(1.5)).toThrow(RangeError);
  });
});

describe('the timelines', () => {
  it('keeps the phases of the prototype in order', () => {
    expect(ATTACK_TIMELINE.windupStart).toBe(250);
    expect(ATTACK_TIMELINE.strikeStart).toBe(520);
    expect(ATTACK_TIMELINE.strikeEnd).toBe(760);
    expect(ATTACK_TIMELINE.travelStart).toBe(600);
    expect(ATTACK_TIMELINE.impactLength).toBe(260);
    expect(ATTACK_TIMELINE.recover).toBe(2000);

    expect(RELOAD_TIMELINE.start).toBe(300);
    expect(RELOAD_TIMELINE.secondHalf).toBe(760);
    expect(RELOAD_TIMELINE.pipInterval).toBe(140);
    expect(RELOAD_TIMELINE.end).toBe(1180);
    expect(RELOAD_TIMELINE.fadeIn).toBe(200);
    expect(RELOAD_TIMELINE.fadeOut).toBe(160);

    expect(IDLE_STEP_MS).toBe(500);
    expect(WALK_STEP_MS).toBe(150);
    expect(MOVE_MS_PER_CELL).toBe(120);
  });
});
