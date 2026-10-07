// The rules of a press (DT-79, DT-84). Phaser's pointers, its timers and its events are the scene's;
// what each of them means is here, so the rules can be read and tested without a canvas.
import { describe, expect, it } from 'vitest';
import type { Pixel } from '../view/grid';
import { Gestures, type PressPointer } from './press';

const AT: Pixel = { x: 100, y: 100 };

/** A point that many pixels away from `AT`, on the diagonal. */
function away(pixels: number): Pixel {
  return { x: AT.x + pixels, y: AT.y + pixels };
}

/** A finger on the canvas at `at`, unless the test says otherwise about it. */
function finger(id: number, at: Pixel = AT, extra: Partial<PressPointer> = {}): PressPointer {
  return { id, at, rightButton: false, touch: true, ...extra };
}

/** The same, for a mouse: the button that never becomes a long press. */
function pointer(at: Pixel = AT): PressPointer {
  return finger(1, at, { touch: false });
}

describe('the press of a finger', () => {
  it('waits for the lift to decide, and asks for the long-press timer only for a finger', () => {
    expect(new Gestures().down(finger(1))).toEqual({ kind: 'begin', longPress: true });
    expect(new Gestures().down(pointer())).toEqual({ kind: 'begin', longPress: false });
  });

  it('is a tap when it lifts where it went down', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));

    expect(gestures.up(finger(1))).toEqual({ kind: 'tap' });
  });

  it('is a tap while it stays inside the slop, and stops waiting past it', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    expect(gestures.waiting()).toBe(true);

    expect(gestures.move(finger(1, away(2)))).toEqual({ kind: 'none' });
    expect(gestures.waiting()).toBe(true);

    const pan = gestures.move(finger(1, away(20)));
    expect(pan).toEqual({ kind: 'pan', by: { x: -20, y: -20 } });
    expect(gestures.waiting()).toBe(false);
  });

  it('does not tap when it lifts past the slop, because it was panning', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.move(finger(1, away(20)));

    expect(gestures.up(finger(1, away(20)))).toEqual({ kind: 'none' });
  });

  it('pans by the whole travel, from where it went down and not from the last move', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.move(finger(1, away(20)));

    expect(gestures.move(finger(1, away(30)))).toEqual({ kind: 'pan', by: { x: -30, y: -30 } });
  });

  it('reads the right button as the inspection at once, and arms nothing', () => {
    const gestures = new Gestures();

    expect(gestures.down(finger(1, AT, { rightButton: true }))).toEqual({ kind: 'inspect' });
    expect(gestures.waiting()).toBe(false);
  });
});

describe('the long press', () => {
  it('inspects when the timer fires, and the lift that follows does not tap', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));

    expect(gestures.longPress()).toEqual({ kind: 'inspect' });
    expect(gestures.waiting()).toBe(false);
    expect(gestures.up(finger(1))).toEqual({ kind: 'none' });
  });

  it('inspects nothing once the gesture stopped being a press', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.move(finger(1, away(20)));

    expect(gestures.longPress()).toEqual({ kind: 'none' });
  });

  it('inspects nothing when no finger is down at all', () => {
    expect(new Gestures().longPress()).toEqual({ kind: 'none' });
  });
});

describe('the pinch', () => {
  it('is begun by the second finger, which takes the press down with it', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    expect(gestures.waiting()).toBe(true);

    const begun = gestures.down(finger(2, { x: 160, y: 100 }));
    expect(begun).toEqual({
      kind: 'pinchBegin',
      pinch: { distance: 60, focal: { x: 130, y: 100 } },
    });
    // The first finger is no longer a press and no longer a drag: lifting it picks no cell.
    expect(gestures.waiting()).toBe(false);
    expect(gestures.up(finger(1, away(20)))).toEqual({ kind: 'none' });
  });

  it('is read again as the fingers move, about the point between them', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.down(finger(2, { x: 160, y: 100 }));

    expect(gestures.move(finger(2, { x: 200, y: 100 }))).toEqual({
      kind: 'pinch',
      pinch: { distance: 100, focal: { x: 150, y: 100 } },
    });
  });

  it('ignores a third finger, so a hand on the screen cannot move the map', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.down(finger(2, { x: 160, y: 100 }));

    expect(gestures.down(finger(3, { x: 400, y: 400 }))).toEqual({ kind: 'none' });
    // The two fingers that pinch are still the two that landed, whatever the third one does.
    expect(gestures.move(finger(3, { x: 500, y: 500 }))).toEqual({ kind: 'none' });
    expect(gestures.move(finger(2, { x: 200, y: 100 }))).toEqual({
      kind: 'pinch',
      pinch: { distance: 100, focal: { x: 150, y: 100 } },
    });
  });
});

describe('a pointer that is not one of the fingers down', () => {
  it('does nothing at all on a move, so a hover never pans the map', () => {
    expect(new Gestures().move(pointer(away(40)))).toEqual({ kind: 'none' });
  });

  it('does nothing on a lift', () => {
    const gestures = new Gestures();

    expect(gestures.up(pointer(away(40)))).toEqual({ kind: 'none' });
  });
});

describe('a pointer the browser takes away', () => {
  it('ends every gesture: nothing waits, nothing taps, nothing pans', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.down(finger(2, { x: 160, y: 100 }));
    gestures.cancel();

    expect(gestures.waiting()).toBe(false);
    expect(gestures.longPress()).toEqual({ kind: 'none' });
    expect(gestures.move(finger(1, away(20)))).toEqual({ kind: 'none' });
    expect(gestures.up(finger(1))).toEqual({ kind: 'none' });
  });

  it('starts over cleanly, so the next finger is a press again', () => {
    const gestures = new Gestures();
    gestures.down(finger(1));
    gestures.cancel();

    expect(gestures.down(finger(1))).toEqual({ kind: 'begin', longPress: true });
    expect(gestures.up(finger(1))).toEqual({ kind: 'tap' });
  });
});
