// Title screen M1 — what the title is allowed to move, from the player's own preference. The scene
// asks for a policy and follows it; nothing here reads the browser.

/** What may move, and how fast the walkers do. `speed` is a multiplier on their own speed. */
export interface MotionPolicy {
  readonly walkers: boolean;
  readonly ambient: boolean;
  readonly stampScale: boolean;
  readonly speed: number;
}

/**
 * The policy for a player who has asked for less motion, or has not. Reduced motion leaves the
 * walkers at their starting points, plays no ambient action, and lets the stamp fade without the
 * slam; everything else about the screen stays where it is.
 */
export function motionPolicy(reduced: boolean): MotionPolicy {
  return reduced
    ? { walkers: false, ambient: false, stampScale: false, speed: 0 }
    : { walkers: true, ambient: true, stampScale: true, speed: 1 };
}
