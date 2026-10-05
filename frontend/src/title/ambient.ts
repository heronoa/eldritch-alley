// Title screen M1 — the ambient action of each class: which pose it holds, how its effect fades, and
// the two blinks the prototype gives the sniper and the vendor.
//
// The poses are columns of the sheet, 0..9, in the order `unit-look.ts` reads a row with
// `frameIndex(row, column)`: idle 1 and 2, walk 1 and 2, melee 1 and 2, ranged 1 and 2, resource 1
// and 2. A `null` column is the caller's cue to draw the walker's own idle pose.

/** How long every ambient action lasts, in seconds. The same 2.4 s `stepWalker` holds it for. */
export const AMBIENT_DURATION_S = 2.4;

/** What a walker stops to do. */
export type AmbientKind = 'reload' | 'meditate-arcane' | 'meditate-faith' | 'throw' | 'idle';

/** The effect drawn with an action, under the walker or over it. */
export type AmbientEffect = 'magic-circle' | 'light-beam' | 'reload-magazine' | 'bottle' | null;

/** The column of the sheet an action shows at `timer` seconds into it, or `null` for the idle pose. */
export function ambientFrame(kind: AmbientKind, timer: number): number | null {
  switch (kind) {
    case 'reload':
      // The sniper stands idle while the magazine is out, at both ends of the action.
      if (timer < 0.3 || timer > 2) return null;
      return timer < 1.1 ? 8 : 9;
    case 'meditate-arcane':
    case 'meditate-faith':
      return Math.floor(timer / 0.22) % 2 === 0 ? 8 : 9;
    case 'throw':
      // The vendor's arm is still until the bottle leaves, and again once it has.
      if (timer < 0.2 || timer > 1.4) return null;
      return timer < 0.5 ? 6 : 7;
    case 'idle':
      return Math.floor(timer / 0.6) % 2 === 0 ? 0 : 1;
  }
}

/** How strongly an effect shows at `timer`: it fades in over 0.3 s, holds, and fades out over 0.3 s. */
export function ambientFade(timer: number): number {
  const fade = Math.min(timer / 0.3, (AMBIENT_DURATION_S - timer) / 0.3);
  return Math.min(1, Math.max(0, fade));
}

/** The effect of an action. Only the two meditations and the reload and the throw draw one. */
export function ambientEffect(kind: AmbientKind): AmbientEffect {
  switch (kind) {
    case 'meditate-arcane':
      return 'magic-circle';
    case 'meditate-faith':
      return 'light-beam';
    case 'reload':
      return 'reload-magazine';
    case 'throw':
      return 'bottle';
    case 'idle':
      return null;
  }
}

/**
 * The bottle of the throw, while it is on screen: `t` runs 0 to 1 over the flight (0.6 s) and again
 * over the shatter (0.3 s). Before and after, there is no bottle to draw.
 */
export function bottleAt(timer: number): { t: number } | null {
  if (timer >= 0.5 && timer < 1.1) return { t: (timer - 0.5) / 0.6 };
  if (timer >= 1.1 && timer < 1.4) return { t: (timer - 1.1) / 0.3 };
  return null;
}

/** Whether the glint on the sniper's scope is lit at `now` seconds: one moment in four. */
export function scopeGlintOn(now: number): boolean {
  return Math.floor(now / 0.9) % 4 === 0;
}

/** Whether the amulet of the Street Vendor blinks at `now` seconds: one moment in six. */
export function amuletBlinkOn(now: number): boolean {
  return Math.floor(now / 0.7) % 6 === 0;
}
