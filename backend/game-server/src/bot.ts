// The bot: a utility heuristic that plays one turn at a time through the engine's public contract.
// It only asks the engine which actions are legal; it never reads the match rng, so the same state
// always produces the same action, and a match stays reproducible.
import { applyAction, type Action, type MatchState, type Position, type Team, type UnitState } from '@eldritch-alley/engine';
import { MAX_HEALTH_BY_UNIT_ID } from './map';

const NEIGHBOUR_OFFSETS: readonly Position[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

/**
 * The weights of the heuristic, higher is better. The order the candidates are built in is the
 * tie-break order, so an action only wins against an earlier one by scoring strictly more.
 *
 * An attack scores `hitChance * damage`, which for this roster is always well above the movement
 * scores, so the bot shoots whenever it can and closes in only when it cannot. An attack that would
 * defeat its target takes `kill` on top, which is what makes finishing a wounded enemy beat chipping
 * a healthy one whenever that bonus outweighs the difference in expected damage between the two.
 */
const SCORE = {
  kill: 100,
  closerMove: 10,
  higherLevel: 5,
  retreat: 20,
  emptyMagazineReload: 15,
  endTurn: 0,
} as const;

/** The damage an attack by this unit deals on a hit: a spent magazine turns it into a melee hit. */
function attackDamage(attacker: UnitState): number {
  const melee = attacker.magazine !== null && attacker.ammo === 0;
  return melee ? attacker.attack >> 1 : attacker.attack;
}

function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Distance to the closest unit still standing on the other side, or Infinity when none is left. */
function nearestEnemyDistance(state: MatchState, from: Position, team: Team): number {
  let nearest = Infinity;
  for (const unit of state.units) {
    if (unit.team === team || unit.defeated) continue;
    nearest = Math.min(nearest, chebyshev(from, unit.position));
  }
  return nearest;
}

/** The level of a cell, or 0 for a cell off the board, which is never higher than a real one. */
function levelAt(state: MatchState, position: Position): number {
  const { width, height, levels } = state.board;
  if (position.x < 0 || position.y < 0 || position.x >= width || position.y >= height) return 0;
  return levels[position.y * width + position.x];
}

/**
 * The action the bot takes on its turn. It throws when no unit is on turn, because that cannot happen
 * in a match that is still running.
 */
export function chooseBotAction(state: MatchState, team: Team): Action {
  const currentId = state.initiative[state.currentIndex];
  const actor = state.units.find((unit) => unit.id === currentId);
  if (!actor) throw new RangeError(`no unit on turn: ${currentId}`);

  const currentDistance = nearestEnemyDistance(state, actor.position, team);
  const wounded = actor.health * 2 < (MAX_HEALTH_BY_UNIT_ID[actor.id] ?? actor.health);
  const levelHere = levelAt(state, actor.position);

  // The candidates are collected in tie-break order: the first one only loses to a strictly higher score.
  const candidates: { action: Action; score: number }[] = [];

  const endTurn: Action = { type: 'endTurn', actor: actor.id };
  if (applyAction(state, endTurn).ok) candidates.push({ action: endTurn, score: SCORE.endTurn });

  for (const offset of NEIGHBOUR_OFFSETS) {
    const to = { x: actor.position.x + offset.x, y: actor.position.y + offset.y };
    const move: Action = { type: 'move', actor: actor.id, to };
    if (!applyAction(state, move).ok) continue;

    const distance = nearestEnemyDistance(state, to, team);
    let score = 0;
    if (distance < currentDistance) score += SCORE.closerMove;
    if (wounded && distance > currentDistance) score += SCORE.retreat;
    if (levelAt(state, to) > levelHere) score += SCORE.higherLevel;
    candidates.push({ action: move, score });
  }

  for (const target of state.units) {
    if (target.team === team || target.defeated) continue;
    const attack: Action = { type: 'attack', actor: actor.id, target: target.id };
    if (!applyAction(state, attack).ok) continue;

    const damage = attackDamage(actor);
    const kills = damage >= target.health;
    candidates.push({ action: attack, score: actor.hitChance * damage + (kills ? SCORE.kill : 0) });
  }

  if (actor.magazine !== null && actor.ammo === 0) {
    const reload: Action = { type: 'reload', actor: actor.id };
    if (applyAction(state, reload).ok) candidates.push({ action: reload, score: SCORE.emptyMagazineReload });
  }

  // A turn always has endTurn among its candidates, so falling back to it only covers a finished match.
  let best = candidates[0];
  if (!best) return endTurn;
  for (const candidate of candidates) {
    if (candidate.score > best.score) best = candidate;
  }
  return best.action;
}
