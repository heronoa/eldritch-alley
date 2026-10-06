// The rules of a press and of a two-finger pinch (DT-79, DT-84), pure and free of Phaser: the scene
// hands it what a pointer did and does what it answers. Nothing here draws, reads the clock or touches
// the camera — the timer of the long press is the scene's, because a timer is I/O, and so is the
// camera. What stays here is the part that was fragile and untested: which gesture a sequence of
// pointer events is.
import { isTap } from '../view/camera-math';
import type { Pixel } from '../view/grid';

/**
 * How long a finger rests before it is inspecting rather than tapping (EA-6, D4). The touch answer to
 * a hover, which is why a mouse button never waits.
 */
export const LONG_PRESS_MS = 400;

/** A pointer as the rules need it, which is a small part of what Phaser reports about one. */
export interface PressPointer {
  /** The pointer's own id, which is what a lift and a move are matched to a press by. */
  id: number;
  at: Pixel;
  /** Whether it went down with the right button, which is the inspection read at once (EA-6). */
  rightButton: boolean;
  /** Whether it is a finger, which is the only kind of pointer that may become a long press. */
  touch: boolean;
}

/** The two fingers of a pinch: how far apart they are, and the point between them the zoom holds. */
export interface Pinch {
  distance: number;
  focal: Pixel;
}

/**
 * What a pointer event means for the match. The scene reads one of these and does the one thing it
 * says, so no rule of a gesture is written down twice.
 */
export type PressOutcome =
  /** Nothing at all: a move inside the slop, a pointer that is no gesture, a timer that arrived late. */
  | { kind: 'none' }
  /** The inspection, now: the right button, or a finger that rested long enough. */
  | { kind: 'inspect' }
  /** A press began: the scene remembers where the camera is, and arms the long press if it is a finger. */
  | { kind: 'begin'; longPress: boolean }
  /** The lift of a press that stayed a tap: an ordinary click, which the scene acts on. */
  | { kind: 'tap' }
  /** The camera follows the finger by this much while the map is being panned. */
  | { kind: 'pan'; by: Pixel }
  /** A second finger landed: the zoom is measured from these two, and the scene keeps them. */
  | { kind: 'pinchBegin'; pinch: Pinch }
  /** The fingers moved: the zoom is read again from where they are now. */
  | { kind: 'pinch'; pinch: Pinch };

/**
 * The gestures of one match: the pointers that are down, the press that is waiting on its own lift,
 * and the drag the camera follows. One instance is a match's worth of input, and `cancel` is what the
 * browser taking a pointer away and the scene shutting down both call.
 */
export class Gestures {
  /** The fingers down, by their own id, in the order they landed. */
  private readonly fingers = new Map<number, Pixel>();
  /** Where the press that is waiting went down, or null when none is (D4). */
  private press: Pixel | null = null;
  /** Where the drag in progress started, or null when the map is not being dragged (EA-12). */
  private dragFrom: Pixel | null = null;

  /** Whether a press is still waiting to become a long press, which is what the scene arms a timer for. */
  waiting(): boolean {
    return this.press !== null;
  }

  /**
   * A pointer goes down. The right button is the inspection and is read at once; a finger may still
   * become a long press, so its press waits for the lift to act (EA-6, D4).
   *
   * The second finger begins the pinch and takes the first one's press down with it, so lifting them
   * never picks a cell after a zoom. A third finger is no gesture at all: the camera has no use for
   * it, and keeping it would let a hand resting on the glass move the map.
   */
  down(pointer: PressPointer): PressOutcome {
    if (pointer.rightButton) return { kind: 'inspect' };
    if (this.fingers.size >= 2) return { kind: 'none' };

    this.fingers.set(pointer.id, pointer.at);

    if (this.fingers.size === 2) {
      this.press = null;
      this.dragFrom = null;
      return { kind: 'pinchBegin', pinch: this.pinch() };
    }

    this.press = pointer.at;
    this.dragFrom = pointer.at;
    return { kind: 'begin', longPress: pointer.touch };
  }

  /**
   * A pointer moves. Two fingers pinch the map; one pans it, and the pan begins only once the gesture
   * is no longer a tap — which is also when the press waiting under it is taken down, so a click never
   * nudges the map and panning never picks a cell by accident (EA-12).
   *
   * A pointer that is not one of the fingers down is no gesture: a mouse hovering over the canvas
   * reports moves, and they belong to nothing.
   */
  move(pointer: PressPointer): PressOutcome {
    if (!this.fingers.has(pointer.id)) return { kind: 'none' };
    this.fingers.set(pointer.id, pointer.at);

    if (this.fingers.size === 2) return { kind: 'pinch', pinch: this.pinch() };
    if (this.fingers.size !== 1 || this.dragFrom === null) return { kind: 'none' };

    if (this.press !== null && !isTap(this.press, pointer.at)) this.press = null;
    if (isTap(this.dragFrom, pointer.at)) return { kind: 'none' };

    // The map moves by the whole travel from where the finger went down, so the world point under the
    // finger stays under it however many moves the drag is reported in.
    return { kind: 'pan', by: { x: this.dragFrom.x - pointer.at.x, y: this.dragFrom.y - pointer.at.y } };
  }

  /**
   * A pointer lifts, or the browser takes it away. A gesture that stayed a tap is an ordinary click,
   * which the scene acts on; one that travelled was panning the map and does nothing else (D4).
   */
  up(pointer: PressPointer): PressOutcome {
    const wasWaiting = this.press !== null;
    const dragFrom = this.dragFrom;

    this.fingers.delete(pointer.id);
    this.press = null;
    this.dragFrom = null;

    const tapped = wasWaiting && dragFrom !== null && isTap(dragFrom, pointer.at);
    return tapped ? { kind: 'tap' } : { kind: 'none' };
  }

  /**
   * The long press ran out: a finger that rested on a unit is inspecting it, and the release that
   * follows must not click as well. One gesture, one meaning (D4).
   */
  longPress(): PressOutcome {
    if (this.press === null) return { kind: 'none' };

    this.press = null;
    return { kind: 'inspect' };
  }

  /** Every gesture ends here: the browser took a pointer away, or the match is over. */
  cancel(): void {
    this.fingers.clear();
    this.press = null;
    this.dragFrom = null;
  }

  /** How far apart the two fingers are, and the point between them the zoom keeps still. */
  private pinch(): Pinch {
    const [first, second] = [...this.fingers.values()];
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      focal: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    };
  }
}
