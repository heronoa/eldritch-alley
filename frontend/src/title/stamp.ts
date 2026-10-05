// Title screen M1 — the stamp the call to action slams onto the screen: how big it is, how solid it
// is, and when it is on screen at all. Nothing here draws; the scene reads a pose and paints it.

/** How long the stamp takes to land, in milliseconds. */
export const STAMP_SLAM_MS = 180;

/** How long the stamp stays up after landing, before it starts to fade. */
export const STAMP_VISIBLE_MS = 1600;

/** How long the stamp takes to fade out. The prototype fades on the same 180 ms it lands on. */
const STAMP_FADE_MS = STAMP_SLAM_MS;

/** The scale the stamp falls from. */
const STAMP_SLAM_SCALE = 1.6;

/** What the screen paints of the stamp at one moment. */
export interface StampPose {
  readonly scale: number;
  readonly opacity: number;
  readonly visible: boolean;
}

const HIDDEN: StampPose = { scale: 1, opacity: 0, visible: false };
const LANDED: StampPose = { scale: 1, opacity: 1, visible: true };

/**
 * The pose of the stamp `elapsedMs` after the press. With `animateScale` off — the reduced-motion
 * case — the stamp does not fall: it only fades, on the same clock.
 */
export function stampAt(elapsedMs: number, animateScale = true): StampPose {
  if (elapsedMs < 0) return HIDDEN;

  if (elapsedMs < STAMP_SLAM_MS) {
    const progress = elapsedMs / STAMP_SLAM_MS;
    const scale = animateScale ? STAMP_SLAM_SCALE - (STAMP_SLAM_SCALE - 1) * progress : 1;
    return { scale, opacity: progress, visible: true };
  }

  if (elapsedMs < STAMP_VISIBLE_MS) return LANDED;

  if (elapsedMs < STAMP_VISIBLE_MS + STAMP_FADE_MS) {
    return { scale: 1, opacity: 1 - (elapsedMs - STAMP_VISIBLE_MS) / STAMP_FADE_MS, visible: true };
  }

  return HIDDEN;
}
