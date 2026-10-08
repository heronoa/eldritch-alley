// The bot: a utility heuristic that plays one turn at a time through the engine's public contract.
// It only asks the engine which actions are legal; it never reads the match rng, so the same state
// always produces the same action, and a match stays reproducible.
import {
  abilityById,
  abilityCells,
  applyAction,
  type AbilityDefinition,
  type Action,
  type MatchState,
  type Position,
  type Team,
  type UnitState,
} from '@eldritch-alley/engine';

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
  emptyPoolReload: 15,
  endTurn: 0,
} as const;

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

/** Every living unit standing on a cell the effect covers when it is aimed at `to` (ADR 0016 §8.2). */
function reachedBy(
  state: MatchState,
  ability: AbilityDefinition,
  to: Position,
): UnitState[] {
  const cells = abilityCells(state, to, ability);
  return state.units.filter(
    (unit) =>
      !unit.defeated &&
      cells.some((cell) => cell.x === unit.position.x && cell.y === unit.position.y),
  );
}

/**
 * What an ability is worth on `to`, to weigh against the basic attack. Provisional: ADR 0016 leaves the
 * scoring to m3-04 and asks m3-03 only to let the ability into the candidates, so this is the shape of
 * the attack's score — expected damage — read over the whole effect and nothing cleverer.
 *
 * A damage effect is worth its amount for every enemy the area reaches, times the chance of each roll,
 * which is what makes a spell reaching two of them beat a shot reaching one. A heal never rolls, so the
 * whole amount is expected, and only a wounded ally is worth it: a squad at full health scores nothing,
 * which keeps the bot from spending a turn on it.
 */
function abilityScore(
  state: MatchState,
  actor: UnitState,
  ability: AbilityDefinition,
  to: Position,
): number {
  const effect = ability.effect;
  const reached = reachedBy(state, ability, to);

  if (effect.kind === 'heal') {
    const wounded = reached.filter(
      (unit) => unit.team === actor.team && unit.health < unit.maxHealth,
    );
    return wounded.length * effect.amount;
  }

  const enemies = reached.filter((unit) => unit.team !== actor.team);
  if (enemies.length === 0) return 0;

  const kills = enemies.some((unit) => effect.amount >= unit.health);
  return enemies.length * effect.amount * actor.hitChance + (kills ? SCORE.kill : 0);
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
  const wounded = actor.health * 2 < actor.maxHealth;
  const levelHere = levelAt(state, actor.position);

  // The candidates are collected in tie-break order: the first one only loses to a strictly higher score.
  const candidates: { action: Action; score: number }[] = [];

  const endTurn: Action = { type: 'endTurn', actor: actor.id, round: state.round };
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

    // Damage is the unit's own attack at every distance (ADR 0011).
    const damage = actor.attack;
    const kills = damage >= target.health;
    candidates.push({ action: attack, score: actor.hitChance * damage + (kills ? SCORE.kill : 0) });
  }

  // The abilities the class carries, aimed at each enemy's own cell: it is where an area reaches the
  // most of them, and the engine refuses the rest for us. They are collected after the attacks, so a
  // spell that only ties a shot loses to it — the attack is the play this bot is sure of (ADR 0016:
  // m3-03 lets the ability into the candidates and leaves the weighing to m3-04).
  for (const abilityId of actor.abilities.activeSets) {
    if (abilityId === null) continue;
    const ability = abilityById(state.catalog, abilityId);
    if (!ability) continue;

    for (const target of state.units) {
      if (target.team === team || target.defeated) continue;
      const cast: Action = { type: 'useAbility', actor: actor.id, abilityId, to: target.position };
      if (!applyAction(state, cast).ok) continue;
      candidates.push({ action: cast, score: abilityScore(state, actor, ability, target.position) });
    }
  }

  // An empty pool is worth refilling whoever carries it: a magazine is reloaded, mana is meditated
  // (ADR 0011). The full bot, which weighs the refill against a spell, is EA-10.
  if (actor.magazine !== null && actor.ammo === 0) {
    const reload: Action = { type: 'reload', actor: actor.id };
    if (applyAction(state, reload).ok) candidates.push({ action: reload, score: SCORE.emptyPoolReload });
  }

  // A turn always has endTurn among its candidates, so falling back to it only covers a finished match.
  let best = candidates[0];
  if (!best) return endTurn;
  for (const candidate of candidates) {
    if (candidate.score > best.score) best = candidate;
  }
  return best.action;
}
