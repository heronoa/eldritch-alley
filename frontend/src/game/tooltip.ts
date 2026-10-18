// What the mouse has to say about what it is resting on: the mud under it, a unit in camouflage, or a
// body with the rounds it has left. Pure — no Phaser, no state of its own — so the precedence between
// the three is decided here and the scene only hands the finished sentence to the HUD.
//
// The sentences come back finished rather than as a key and its params, the way `coverSentence` and
// `describeEvent` answer, so the caller never has to know which of the catalog's keys a situation
// reaches for.
import { t, type MessageKey } from '../i18n';
import type { PublicState, Team, UnitId } from '../protocol';
import type { Cell } from '../view/grid';
import { corpseRoundsLeft } from '../view/unit-look';

/**
 * The four ways a body is worded: the local player's side of it, and whether one round is left or
 * more. The catalog has no plural rule, so the two counts are two keys.
 */
const CORPSE_KEYS = {
  ally: {
    one: 'hud.tooltip.corpse.ally.one',
    other: 'hud.tooltip.corpse.ally.other',
  },
  enemy: {
    one: 'hud.tooltip.corpse.enemy.one',
    other: 'hud.tooltip.corpse.enemy.other',
  },
} as const satisfies Record<'ally' | 'enemy', Record<'one' | 'other', MessageKey>>;

/**
 * The sentence the mouse carries over `cell`, or null when there is nothing to say.
 *
 * The order is the one the player reads: a body first (it will be gone for good in a few rounds), then
 * a camouflaged unit (it cannot be aimed at), then the difficult terrain under whatever else is there.
 * A unit removed for good is not on the board at all, so it says nothing and the tile under it answers.
 */
export function hoverTooltip(
  state: Pick<PublicState, 'round' | 'units' | 'difficultTerrain'>,
  cell: Cell | null,
  unitId: UnitId | null,
  humanTeam: Team,
): string | null {
  const unit = unitId === null ? undefined : state.units.find((candidate) => candidate.id === unitId);

  if (unit !== undefined && !unit.permanentlyDead) {
    const rounds = corpseRoundsLeft(state.round, unit);
    if (rounds !== null) {
      const side = unit.team === humanTeam ? 'ally' : 'enemy';
      const count = rounds === 1 ? 'one' : 'other';
      return t(CORPSE_KEYS[side][count], { rounds });
    }

    if (!unit.defeated && unit.camouflage !== null) return t('hud.tooltip.camouflage');
  }

  const muddy =
    cell !== null &&
    state.difficultTerrain.some(
      (mud) => mud.position.x === cell.x && mud.position.y === cell.y,
    );
  if (muddy) return t('hud.tooltip.difficultTerrain');

  return null;
}
