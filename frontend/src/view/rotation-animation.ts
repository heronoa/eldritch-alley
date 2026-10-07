// The short turn between two views. Plain arithmetic over elapsed milliseconds, no Phaser: the scene
// hands in the time since the turn began and draws whatever this answers.
//
// Details such as windows, kerbs and road markings only exist for the four right angles. Nobody notices
// their absence during half a second of motion, so the map is drawn in a simplified form while it turns
// and the detailed view snaps in at the end.

/** How long a turn takes. Long enough to be read as a turn, short enough to stay out of the way. */
export const ROTATION_MS = 450;

/** How far the turn has run at `elapsedMs`, from 0 at the start to 1 when the view has arrived. */
export function rotationProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / ROTATION_MS);
}

/** Cubic ease-in-out: the turn leaves slowly, runs, and settles, instead of jerking into place. */
export function easeInOutCubic(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Where the view stands, in degrees, at `elapsedMs` into a turn from one angle to another. The angles
 * are cumulative, so a second turn to the right carries on from where the first left off.
 */
export function rotationAngle(fromDegrees: number, toDegrees: number, elapsedMs: number): number {
  return fromDegrees + (toDegrees - fromDegrees) * easeInOutCubic(rotationProgress(elapsedMs));
}

/**
 * Whether the map is still turning, and so is to be drawn in its simplified form: flat blocks, tall
 * buildings translucent, units as billboards. The moment the turn is over, the detailed view is back.
 */
export function simplifiedAt(progress: number): boolean {
  return progress < 1;
}
