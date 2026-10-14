// How long a step's own cues take to finish playing, so the animation queue (P2) never starts the
// next accepted action's cues before this one has had time to show. The scene plays the cue; this
// only says how long it takes, reusing the timings `view/animation.ts` already defines.
import { ATTACK_TIMELINE, RELOAD_TIMELINE, movementDuration } from '../view/animation';
import type { Cue } from './presentation';

function cueDurationMs(cue: Cue): number {
  switch (cue.kind) {
    case 'move':
      return movementDuration(cue.steps.length - 1);
    case 'attack':
      // The full recovery, win or miss: a `playAttack` call is never safe to overwrite before it,
      // since the sprite's own `this.action` is a single mutable slot (DT-?? / M4 playtest fix).
      return ATTACK_TIMELINE.recover;
    case 'reload':
      return RELOAD_TIMELINE.end;
    // An ability's own drawing has several timings of its own (`scenes/effects.ts`), not yet exported
    // as one total; the attack's own recovery is reused here as a conservative stand-in (see the M4
    // plan's review, § "Scope and cost").
    case 'ability':
      return ATTACK_TIMELINE.recover;
    // A defeat or a removal is an instant flip of what is already drawn: nothing to wait for.
    case 'defeat':
    case 'remove':
      return 0;
  }
}

/** How long a whole step takes: the slowest of its own cues, or none at all for an empty step. */
export function stepDurationMs(cues: readonly Cue[]): number {
  return cues.reduce((longest, cue) => Math.max(longest, cueDurationMs(cue)), 0);
}
