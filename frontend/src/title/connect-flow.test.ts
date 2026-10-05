// Title screen M1 — the call to action as a state machine: the press, the server's answer, the
// failure, the retry, and the wait for the stamp to land.
import { describe, expect, it } from 'vitest';
import { canTransition, next, type Flow } from './connect-flow';

const IDLE: Flow = { state: 'idle', stampStartedAt: null, failure: null };

/** The flow after a press at `pressedAt`. */
function pressed(pressedAt = 1000): Flow {
  return next(IDLE, 'press', pressedAt);
}

describe('next', () => {
  it('starts connecting on the first press, and stamps the moment', () => {
    expect(pressed()).toEqual({ state: 'connecting', stampStartedAt: 1000, failure: null });
  });

  it('ignores a second press while it is connecting', () => {
    const connecting = pressed();
    expect(next(connecting, 'press', 1200)).toBe(connecting);
  });

  it('becomes ready when the server confirms, keeping the stamp', () => {
    expect(next(pressed(), 'connected', 1500)).toEqual({
      state: 'ready',
      stampStartedAt: 1000,
      failure: null,
    });
  });

  it('fails without a stamp when the server does not answer', () => {
    expect(next(pressed(), 'failed', 1500)).toEqual({
      state: 'failed',
      stampStartedAt: null,
      failure: 'unavailable',
    });
  });

  it('lets the player press again after a failure', () => {
    const failed = next(pressed(), 'failed', 1500);
    expect(next(failed, 'press', 2000)).toEqual({
      state: 'connecting',
      stampStartedAt: 2000,
      failure: null,
    });
  });

  it('ignores every event once the match is ready', () => {
    const ready = next(pressed(), 'connected', 1500);
    expect(next(ready, 'press', 1600)).toBe(ready);
    expect(next(ready, 'connected', 1600)).toBe(ready);
    expect(next(ready, 'failed', 1600)).toBe(ready);
  });

  it('leaves the flow it is handed alone', () => {
    const flow: Flow = { state: 'idle', stampStartedAt: null, failure: null };
    const snapshot = { ...flow };
    next(flow, 'press', 1000);
    expect(flow).toEqual(snapshot);
  });
});

describe('the reason a failure carries', () => {
  it('keeps the reason it was given', () => {
    expect(next(pressed(), 'failed', 1500, 'occupied')).toEqual({
      state: 'failed',
      stampStartedAt: null,
      failure: 'occupied',
    });
  });

  it('is the generic one when no reason is given, so the old call sites keep their meaning', () => {
    expect(next(pressed(), 'failed', 1500).failure).toBe('unavailable');
  });

  it('is cleared by the next press, so a retry does not show the old line', () => {
    const failed = next(pressed(), 'failed', 1500, 'occupied');
    expect(next(failed, 'press', 2000).failure).toBeNull();
  });

  it('is carried by no state but the failed one', () => {
    expect(pressed().failure).toBeNull();
    expect(next(pressed(), 'connected', 1500).failure).toBeNull();
    expect(IDLE.failure).toBeNull();
  });
});

describe('canTransition', () => {
  it('waits out the 180 ms slam before the screen changes', () => {
    const ready = next(pressed(1000), 'connected', 1100);
    expect(canTransition(ready, 1179)).toBe(false);
    expect(canTransition(ready, 1180)).toBe(true);
    expect(canTransition(ready, 2000)).toBe(true);
  });

  it('never lets a connecting or failed flow through', () => {
    const connecting = pressed();
    expect(canTransition(connecting, 5000)).toBe(false);
    expect(canTransition(next(connecting, 'failed', 1500), 5000)).toBe(false);
    expect(canTransition(IDLE, 5000)).toBe(false);
  });
});
