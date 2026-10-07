// The public entry point of the engine: build a match, request an action, rebuild a match from its
// events, and hash the result.
import { buildEvents, validateAction } from './actions';
import { applyEvent } from './events';
import { canonicalize, fnv1a } from './hash';
import { buildInitiativeQueue } from './initiative';
import { DEFAULT_MOVEMENT_PROFILE } from './movement';
import { createRng } from './rng';
import type {
  Abilities,
  Action,
  ActionResult,
  Board,
  BoardState,
  Equipment,
  Event,
  MatchSetup,
  MatchState,
  MovementProfile,
  PublicState,
  Rng,
  Unit,
  UnitState,
} from './types';

const UINT32_MAX = 0xffffffff;

function requireIntegerInRange(value: number, label: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer between ${min} and ${max}, got ${value}`);
  }
}

/** For numbers with no upper bound in the rules, such as speed or attack. */
function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
  }
}

function validateBoard(board: Board): void {
  if (!board || typeof board !== 'object') throw new RangeError('map must be a board');

  requireIntegerInRange(board.width, 'map.width', 1, 1024);
  requireIntegerInRange(board.height, 'map.height', 1, 1024);

  if (!Array.isArray(board.levels) || board.levels.length !== board.width * board.height) {
    throw new RangeError('map.levels must hold one integer level per cell');
  }
  board.levels.forEach((level, index) => {
    requireIntegerInRange(level, `map.levels[${index}]`, 0, 255);
  });

  // A prop is read by the rules as the cell it stands on, so the board must be able to answer "what
  // stands here" without a second guess: one prop per cell, inside the board, of a known kind.
  const occupied = new Set<number>();
  (board.props ?? []).forEach((prop, index) => {
    requireIntegerInRange(prop.position.x, `map.props[${index}].position.x`, 0, board.width - 1);
    requireIntegerInRange(prop.position.y, `map.props[${index}].position.y`, 0, board.height - 1);
    if (prop.kind !== 'wall' && prop.kind !== 'cover') {
      throw new RangeError(`map.props[${index}].kind must be wall or cover`);
    }

    const cell = prop.position.y * board.width + prop.position.x;
    if (occupied.has(cell)) {
      throw new RangeError(`map.props[${index}] stands on a cell another prop already occupies`);
    }
    occupied.add(cell);
  });
}

function isOptionalId(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

function validateEquipment(equipment: Equipment, unitId: string): void {
  if (!equipment || typeof equipment !== 'object') {
    throw new RangeError(`${unitId}.equipment must be an object`);
  }
  for (const slot of ['armor', 'helmet', 'mainHand', 'offHand', 'accessory1', 'accessory2'] as const) {
    if (!isOptionalId(equipment[slot])) {
      throw new RangeError(`${unitId}.equipment.${slot} must be an item id or null`);
    }
  }
}

function validateAbilities(abilities: Abilities, unitId: string): void {
  if (!abilities || typeof abilities !== 'object') {
    throw new RangeError(`${unitId}.abilities must be an object`);
  }
  if (!Array.isArray(abilities.activeSets) || abilities.activeSets.length !== 2) {
    throw new RangeError(`${unitId}.abilities.activeSets must hold exactly two sets`);
  }
  abilities.activeSets.forEach((set, index) => {
    if (!isOptionalId(set)) {
      throw new RangeError(`${unitId}.abilities.activeSets[${index}] must be an ability id or null`);
    }
  });
  for (const slot of ['reaction', 'movement', 'support'] as const) {
    if (!isOptionalId(abilities[slot])) {
      throw new RangeError(`${unitId}.abilities.${slot} must be an ability id or null`);
    }
  }
}

/** A profile is authored data, so a malformed one is a programming error like the rest of the setup. */
function validateMovementProfile(profile: MovementProfile, unitId: string): void {
  if (!profile || typeof profile !== 'object') {
    throw new RangeError(`${unitId}.movementProfile must be an object`);
  }
  requireNonNegativeInteger(profile.maxStepUp, `${unitId}.movementProfile.maxStepUp`);
  requireNonNegativeInteger(profile.maxStepDown, `${unitId}.movementProfile.maxStepDown`);
  requireNonNegativeInteger(profile.climbCost, `${unitId}.movementProfile.climbCost`);
}

function validateUnit(unit: Unit, board: Board): void {
  if (typeof unit.id !== 'string' || unit.id.length === 0) {
    throw new RangeError('every unit needs a non-empty string id');
  }
  if (unit.team !== 'A' && unit.team !== 'B') {
    throw new RangeError(`${unit.id}.team must be A or B`);
  }
  if (!unit.position || typeof unit.position !== 'object') {
    throw new RangeError(`${unit.id}.position must be an object`);
  }

  requireIntegerInRange(unit.position.x, `${unit.id}.position.x`, 0, board.width - 1);
  requireIntegerInRange(unit.position.y, `${unit.id}.position.y`, 0, board.height - 1);
  requireNonNegativeInteger(unit.speed, `${unit.id}.speed`);
  requireNonNegativeInteger(unit.health, `${unit.id}.health`);
  requireNonNegativeInteger(unit.attack, `${unit.id}.attack`);
  requireNonNegativeInteger(unit.range, `${unit.id}.range`);
  requireNonNegativeInteger(unit.movement, `${unit.id}.movement`);
  requireIntegerInRange(unit.hitChance, `${unit.id}.hitChance`, 0, 100);
  requireIntegerInRange(unit.nerve, `${unit.id}.nerve`, 0, 100);
  if (unit.magazine !== null) requireIntegerInRange(unit.magazine, `${unit.id}.magazine`, 0, 999);
  requireIntegerInRange(unit.attunement, `${unit.id}.attunement`, 0, 100);

  if (typeof unit.primaryClass !== 'string' || unit.primaryClass.length === 0) {
    throw new RangeError(`${unit.id}.primaryClass must be a non-empty string`);
  }

  if (unit.movementProfile !== undefined) validateMovementProfile(unit.movementProfile, unit.id);
  validateEquipment(unit.equipment, unit.id);
  validateAbilities(unit.abilities, unit.id);
}

/**
 * A malformed setup is a programming error, so it throws. A rule violation never throws: it comes
 * back as a rejected action.
 */
function validateSetup(setup: MatchSetup): void {
  if (!Number.isInteger(setup.seed) || setup.seed < 0 || setup.seed > UINT32_MAX) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }

  validateBoard(setup.map);

  if (!Array.isArray(setup.teams) || setup.teams.length !== 2) {
    throw new RangeError('teams must hold exactly two squads');
  }

  const taken = new Set<string>();
  const ids = new Set<string>();
  for (const squad of setup.teams) {
    if (squad.length === 0) throw new RangeError('each team needs at least one unit');
    for (const unit of squad) {
      validateUnit(unit, setup.map);
      if (ids.has(unit.id)) throw new RangeError(`two units share the id ${unit.id}`);
      ids.add(unit.id);
      const cell = `${unit.position.x},${unit.position.y}`;
      if (taken.has(cell)) throw new RangeError(`two units share the cell ${cell}`);
      taken.add(cell);
    }
  }
}

function toUnitState(unit: Unit): UnitState {
  const activeSets: [string | null, string | null] = [
    unit.abilities.activeSets[0],
    unit.abilities.activeSets[1],
  ];
  return {
    ...unit,
    position: { x: unit.position.x, y: unit.position.y },
    // The setup may author the profile; a unit that carries none plays by the default rule, which is
    // the rule the game had before the profile existed.
    movementProfile: { ...(unit.movementProfile ?? DEFAULT_MOVEMENT_PROFILE) },
    equipment: { ...unit.equipment },
    abilities: { ...unit.abilities, activeSets },
    // The setup authors the starting health, and nothing starts a unit wounded, so it is the ceiling.
    maxHealth: unit.health,
    defeated: false,
    ammo: unit.magazine ?? 0,
    // The pool a basic attack spends (ADR 0011). A unit that carries a magazine and names no kind is
    // an ammunition class, which is every class of the roster before the magic ones; a unit with no
    // magazine has no pool at all.
    resourceKind: unit.magazine === null ? null : (unit.resourceKind ?? 'ammo'),
    permanentlyDead: false,
    corpseExpiresAtRound: null,
  };
}

export function newMatch(setup: MatchSetup): MatchState {
  validateSetup(setup);

  const board: BoardState = {
    width: setup.map.width,
    height: setup.map.height,
    levels: [...setup.map.levels],
    // A setup may leave the props out, the way it may leave a unit's movement profile out; a board
    // inside a match always carries them, so no rule has to ask whether they are there.
    props: (setup.map.props ?? []).map((prop) => ({
      position: { x: prop.position.x, y: prop.position.y },
      kind: prop.kind,
    })),
  };
  const units = [...setup.teams[0], ...setup.teams[1]].map(toUnitState);
  const initiative = buildInitiativeQueue(units);
  const first = units.find((unit) => unit.id === initiative[0]);

  return {
    seed: setup.seed,
    board,
    units,
    initiative,
    currentIndex: 0,
    movementLeft: first ? first.movement : 0,
    round: 1,
    hasActed: false,
    pendingMove: null,
    rng: createRng(setup.seed),
    eventCount: 0,
  };
}

/**
 * Validates and resolves one action. An accepted action returns the next state and the events it
 * produced; the state passed in is never changed, so a rejected action leaves no trace.
 */
export function applyAction(state: MatchState, action: Action): ActionResult {
  const reason = validateAction(state, action);
  if (reason) return { ok: false, reason };

  // The roll happens on a copy, so the caller's rng only advances when the action is accepted.
  const rng: Rng = { state: state.rng.state };
  const events = buildEvents(state, action, rng);

  let next: MatchState = { ...state, rng };
  for (const event of events) next = applyEvent(next, event);

  return { ok: true, state: next, events };
}

/** Rebuilds a match from its setup and its events, which is what a replay or an audit does. */
export function applyEvents(setup: MatchSetup, events: readonly Event[]): MatchState {
  let state = newMatch(setup);
  for (const event of events) state = applyEvent(state, event);
  return state;
}

/**
 * Copies plain data recursively, so no array or object is shared with the state it came from.
 * The engine's state is only plain data (see types.ts), so this covers all of it.
 */
function cloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneData(item)) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = cloneData(item);
    return copy as T;
  }
  return value;
}

/** The state without the random source, as an independent copy. This is what the server may send to a client. */
export function publicState(state: MatchState): PublicState {
  const { rng, ...view } = state;
  return cloneData(view);
}

/**
 * The fingerprint of a match, over the public view. The rng is left out on purpose: a replay never
 * rolls, so a hash that included it could not match the live match it reproduces.
 */
export function hashState(state: MatchState): number {
  return fnv1a(canonicalize(publicState(state)));
}
