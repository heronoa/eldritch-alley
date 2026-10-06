// The banner a turn change raises, and the one it must not raise. Pure: the HUD shows the line this
// returns and knows nothing about whose turn it is.
//
// The banner belongs to the turn, not to the action that moved it along, so it is decided by
// comparing the unit on turn before and after: a move or a shot leaves the same unit on turn and
// raises nothing, while a hand-over to the other side raises the line of that side.
import { t } from '../i18n';
import type { Team } from '../protocol';
import type { TurnSlot } from './turn-order';

/** One line, kept on the screen for `durationMs` before it fades. */
export interface TurnBanner {
  text: string;
  durationMs: number;
}

/** Decision D1 of the EA-3 plan: a turn banner fades out on its own after 1.5 s. */
export const BANNER_DURATION_MS = 1500;

/**
 * The banner the hand-over from `previous` to `current` raises, or null when nothing changed. The
 * text follows the team of the unit taking the turn: the human side reads one line, the other side
 * the other, whichever side the player is on.
 */
export function bannerFor(
  previous: TurnSlot | null,
  current: TurnSlot | null,
  humanTeam: Team,
): TurnBanner | null {
  if (current === null) return null;
  if (previous !== null && previous.unit.id === current.unit.id) return null;

  return {
    text: t(current.unit.team === humanTeam ? 'hud.banner.yourTurn' : 'hud.banner.enemyTurn'),
    durationMs: BANNER_DURATION_MS,
  };
}
