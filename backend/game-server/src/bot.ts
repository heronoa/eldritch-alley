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
  type UnitId,
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
 *
 * `endTurn` is built first (M4 playtest fix): while an enemy still stands, it scores
 * `endTurnWhileEngaged`, below every move, so a move that goes nowhere useful — it neither gets
 * closer nor climbs — still beats passing, instead of tying with `endTurn` and losing the tie-break
 * to it. `endTurn` keeps its own zero once every enemy is down, and it is always a candidate
 * (`applyAction` never refuses it), so a turn with nothing else legal still has somewhere to fall back to.
 *
 * The three new kinds are provisional like the damage and heal scores (ADR 0016 leaves the scoring to
 * m3-04, ADR 0023 §6). A revive is worth a turn on its own; hiding is worth it only when there is
 * health to protect and an enemy near enough to take it; and a layer of mud is worth more the more
 * enemies stand in it and less with every ally it also catches.
 */
const SCORE = {
  kill: 100,
  revive: 80,
  camouflage: 60,
  terrainEnemy: 2,
  terrainAlly: 2,
  closerMove: 10,
  higherLevel: 5,
  retreat: 20,
  emptyPoolReload: 15,
  endTurn: 0,
  endTurnWhileEngaged: -1,
} as const;

/** How close an enemy has to be for a wounded unit to spend its turn hiding (Chebyshev cells). */
const CAMOUFLAGE_THREAT_RANGE = 6;

function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function isWounded(unit: UnitState): boolean {
  return unit.health * 2 < unit.maxHealth;
}

/**
 * Distance to the closest unit still standing on the other side, or Infinity when none is left.
 * A camouflaged enemy is skipped: a basic attack cannot name it, so walking towards it is walking
 * towards a target the bot has no way to use.
 */
function nearestEnemyDistance(state: MatchState, from: Position, team: Team): number {
  let nearest = Infinity;
  for (const unit of state.units) {
    if (unit.team === team || unit.defeated || unit.camouflage !== null) continue;
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
 * the attack's score read over the whole effect and nothing cleverer.
 *
 * A damage effect is worth its amount for every enemy the area reaches, times the chance of each roll,
 * which is what makes a spell reaching two of them beat a shot reaching one. A heal never rolls, so the
 * whole amount is expected, and only a wounded ally is worth it: a squad at full health scores nothing,
 * which keeps the bot from spending a turn on it. The three new kinds follow the same principle — a
 * score of zero is a cast the bot does not offer.
 */
function abilityScore(
  state: MatchState,
  actor: UnitState,
  ability: AbilityDefinition,
  to: Position,
): number {
  const effect = ability.effect;
  const reached = reachedBy(state, ability, to);

  switch (effect.kind) {
    case 'damage': {
      const enemies = reached.filter((unit) => unit.team !== actor.team);
      if (enemies.length === 0) return 0;

      const kills = enemies.some((unit) => effect.amount >= unit.health);
      return enemies.length * effect.amount * actor.hitChance + (kills ? SCORE.kill : 0);
    }
    case 'heal': {
      const wounded = reached.filter(
        (unit) => unit.team === actor.team && unit.health < unit.maxHealth,
      );
      return wounded.length * effect.amount;
    }
    case 'camouflage': {
      // Hiding costs a turn and the whole cast, so it is only worth it with health to protect and an
      // enemy close enough to take it. An unhurt unit has nothing to hide.
      const threatened =
        nearestEnemyDistance(state, actor.position, actor.team) <= CAMOUFLAGE_THREAT_RANGE;
      return isWounded(actor) && threatened ? SCORE.camouflage : 0;
    }
    case 'terrain':
      return reached.reduce(
        (score, unit) =>
          score + (unit.team === actor.team ? -SCORE.terrainAlly : SCORE.terrainEnemy),
        0,
      );
    case 'revive':
      return SCORE.revive;
  }
}

function castAction(
  actor: UnitState,
  ability: AbilityDefinition,
  to: Position,
  target?: UnitId,
): Action {
  return {
    type: 'useAbility',
    actor: actor.id,
    abilityId: ability.id,
    to,
    ...(target === undefined ? {} : { target }),
  };
}

/** The first free cell a revive accepts, scanned in reading order, or null when none is in reach. */
function reviveCell(
  state: MatchState,
  actor: UnitState,
  ability: AbilityDefinition,
  target: UnitId,
): Position | null {
  for (let y = 0; y < state.board.height; y += 1) {
    for (let x = 0; x < state.board.width; x += 1) {
      if (applyAction(state, castAction(actor, ability, { x, y }, target)).ok) return { x, y };
    }
  }
  return null;
}

/**
 * The casts worth weighing, one rule per effect kind (ADR 0023 §2): a status aimed at the caster, a
 * layer over every cell in reach, a revive per fallen ally, and a damage or heal aimed at the cell of a
 * unit the effect could reach. Every cast is offered to `applyAction` first, so the list holds only
 * casts the engine would take, the same door every other candidate goes through.
 */
function legalCasts(
  state: MatchState,
  actor: UnitState,
  team: Team,
  ability: AbilityDefinition,
): Action[] {
  const effect = ability.effect;

  if (effect.kind === 'camouflage') {
    const cast = castAction(actor, ability, actor.position);
    return applyAction(state, cast).ok ? [cast] : [];
  }

  if (effect.kind === 'terrain') {
    const casts: Action[] = [];
    for (let y = actor.position.y - ability.range; y <= actor.position.y + ability.range; y += 1) {
      for (let x = actor.position.x - ability.range; x <= actor.position.x + ability.range; x += 1) {
        const cast = castAction(actor, ability, { x, y });
        if (applyAction(state, cast).ok) casts.push(cast);
      }
    }
    return casts;
  }

  if (effect.kind === 'revive') {
    const casts: Action[] = [];
    for (const fallen of state.units) {
      if (fallen.team !== team || !fallen.defeated || fallen.permanentlyDead) continue;

      const to = reviveCell(state, actor, ability, fallen.id);
      if (to) casts.push(castAction(actor, ability, to, fallen.id));
    }
    return casts;
  }

  // A damage effect is aimed where enemies stand; a heal where units stand at all, since the area
  // around a wounded ally is what it is for.
  const aims =
    effect.kind === 'heal'
      ? state.units.filter((unit) => !unit.defeated)
      : state.units.filter((unit) => unit.team !== team && !unit.defeated);

  const casts: Action[] = [];
  const seen = new Set<string>();
  for (const unit of aims) {
    const key = `${unit.position.x},${unit.position.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cast = castAction(actor, ability, unit.position);
    if (applyAction(state, cast).ok) casts.push(cast);
  }
  return casts;
}

/** One action the bot weighs, and the score it weighs it by. */
export interface BotCandidate {
  action: Action;
  score: number;
  /** The cells a cast covers; absent on anything that is not a `useAbility`. */
  abilityCells?: Position[];
}

/**
 * Every action the bot would consider on this turn, in tie-break order. The unit on turn is the one the
 * state names; a caller that wants to observe the candidates without picking one reads this list, and
 * `chooseBotAction` is the pick over it.
 */
export function botCandidates(state: MatchState, team: Team): BotCandidate[] {
  const currentId = state.initiative[state.currentIndex];
  const actor = state.units.find((unit) => unit.id === currentId);
  if (!actor) throw new RangeError(`no unit on turn: ${currentId}`);

  const currentDistance = nearestEnemyDistance(state, actor.position, team);
  const wounded = isWounded(actor);
  const levelHere = levelAt(state, actor.position);

  const candidates: BotCandidate[] = [];

  const endTurn: Action = { type: 'endTurn', actor: actor.id, round: state.round };
  if (applyAction(state, endTurn).ok) {
    const engaged = currentDistance !== Infinity;
    candidates.push({
      action: endTurn,
      score: engaged ? SCORE.endTurnWhileEngaged : SCORE.endTurn,
    });
  }

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

  // The abilities the class carries, collected after the attacks so a spell that only ties a shot
  // loses to it (ADR 0016: m3-03 lets the ability into the candidates and leaves the weighing to
  // m3-04). A cast that scores nothing is not offered at all.
  for (const abilityId of actor.abilities.activeSets) {
    if (abilityId === null) continue;
    const ability = abilityById(state.catalog, abilityId);
    if (!ability) continue;

    for (const cast of legalCasts(state, actor, team, ability)) {
      if (cast.type !== 'useAbility') continue;

      const score = abilityScore(state, actor, ability, cast.to);
      if (score <= 0) continue;

      candidates.push({
        action: cast,
        score,
        abilityCells: abilityCells(state, cast.to, ability),
      });
    }
  }

  // An empty pool is worth refilling whoever carries it: a magazine is reloaded, mana is meditated
  // (ADR 0011). The full bot, which weighs the refill against a spell, is EA-10.
  if (actor.magazine !== null && actor.ammo === 0) {
    const reload: Action = { type: 'reload', actor: actor.id };
    if (applyAction(state, reload).ok) candidates.push({ action: reload, score: SCORE.emptyPoolReload });
  }

  return candidates;
}

/**
 * The action the bot takes on its turn. It throws when no unit is on turn, because that cannot happen
 * in a match that is still running.
 */
export function chooseBotAction(state: MatchState, team: Team): Action {
  const candidates = botCandidates(state, team);
  const currentId = state.initiative[state.currentIndex];

  // A turn always has endTurn among its candidates, so falling back to it only covers a finished match.
  let best = candidates[0];
  if (!best) return { type: 'endTurn', actor: currentId, round: state.round };
  for (const candidate of candidates) {
    if (candidate.score > best.score) best = candidate;
  }
  return best.action;
}
