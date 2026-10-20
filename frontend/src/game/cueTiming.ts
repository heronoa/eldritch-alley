// How long a step's own cues take to finish playing, so the animation queue (P2) never starts the
// next accepted action's cues before this one has had time to show. The scene plays the cue; this
// only says how long it takes, reusing the timings `view/animation.ts` already defines.
import { ATTACK_TIMELINE, RELOAD_TIMELINE, movementDuration } from '../view/animation';
import { BANNER_DURATION_MS } from './banner';
import type { Cue } from './presentation';
import type { Team } from '../protocol';

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
    // The cues of the second active set are state flips too: the camouflage is gone, the unit stands,
    // the mud dries and the revived unit appears. The drawing itself is m4 (ADR 0023).
    case 'camouflage-ended':
    case 'stand-up':
    case 'terrain-expired':
    case 'revive':
      return 0;
  }
}

/** How long a whole step takes: the slowest of its own cues, or none at all for an empty step. */
export function stepDurationMs(cues: readonly Cue[]): number {
  return cues.reduce((longest, cue) => Math.max(longest, cueDurationMs(cue)), 0);
}

/**
 * How long to wait before the queue (P2) moves on to the next step: the ordinary cue duration, unless
 * this step is the bot ending a turn with nothing else to show for it — a pure skip, which would
 * otherwise last zero milliseconds and read as nothing having happened at all. Held instead for as
 * long as the turn banner itself (M4 playtest fix): a hand-over that changes nothing but the unit on
 * turn still raises one, and this is what gives a player the time to read it.
 *
 * The human's own `endTurn` is exempt — passing on purpose stays the single click it always was — and
 * so is a step with nothing on turn at all, such as the join or a reconnect's resync.
 */
export function stepWaitMs(cues: readonly Cue[], actingTeam: Team | null, humanTeam: Team): number {
  const isSilentBotSkip = cues.length === 0 && actingTeam !== null && actingTeam !== humanTeam;
  return isSilentBotSkip ? BANNER_DURATION_MS : stepDurationMs(cues);
}
