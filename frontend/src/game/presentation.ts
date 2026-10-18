// What one server event looks like on the board: the list of cues the scene plays.
//
// The presentation never changes the outcome — the server already fixed it. This module is pure, so
// every rule that picks an animation is testable without a browser, and the scene only draws.
import { abilityById, abilityCells } from '@eldritch-alley/engine';
import type { AbilityDefinition, Event, Position, PublicState } from '../protocol';
import { EFFECTS, attackStyle, type Effect } from '../view/effects';

/**
 * What an ability did where it landed (EA-16). The kind of the effect decides which of the three it is,
 * so the animation follows the rules of the ability and not its name: the engine never learns a class
 * or an ability name (ADR 0016 §13), and neither does the drawing that follows it.
 */
export type AbilityImpact =
  /** A heal, lifting off every cell it covers. It never rolls, so it never flashes a body (ADR 0016 §10). */
  | { kind: 'glow'; cells: Position[]; color: number }
  /** A shot with no area: one cell, thrown with the effect of the caster's own class at reach. */
  | { kind: 'shot'; cell: Position; effect: Effect }
  /** A blast that covers more than its own cell: a ring on the aim and a flash on every cell of it. */
  | { kind: 'blast'; cell: Position; cells: Position[]; color: number };

/** One thing to play. The scene reads the cue; nothing here touches Phaser. */
export type Cue =
  /** The cells of the walk, `from` first, so the scene can tween the figure step by step. */
  | { kind: 'move'; unitId: string; from: Position; to: Position; steps: Position[] }
  | {
      kind: 'attack';
      actorId: string;
      targetId: string;
      style: 'melee' | 'ranged';
      hit: boolean;
      effect: Effect;
    }
  | { kind: 'reload'; unitId: string; from: number; to: number }
  /**
   * An ability used on a cell (ADR 0016 §5, EA-16). The cell is the one the action named, and the
   * impact is what the effect does there — which is all the scene needs to draw it.
   */
  | { kind: 'ability'; actorId: string; cell: Position; impact: AbilityImpact }
  | { kind: 'defeat'; unitId: string }
  | { kind: 'remove'; unitId: string }
  /** A camouflage ended, and the reason the scene may draw differently (ADR 0023 §3). */
  | { kind: 'camouflage-ended'; unitId: string; reason: 'expired' | 'broken' }
  | { kind: 'stand-up'; unitId: string }
  /** The cells the mud dried off, exactly the ones the event named (ADR 0023 §4). */
  | { kind: 'terrain-expired'; cells: Position[] }
  /** The revived unit, and the cell the event brought it to (ADR 0023 §7). */
  | { kind: 'revive'; unitId: string; to: Position };

/** What the client knew about a unit when the event was played. */
export interface Snapshot {
  position: Position;
  primaryClass: string;
  magazine: number | null;
}

/**
 * What the ability did on the board, as the scene draws it (EA-16). The kind of the effect decides it,
 * so the three abilities of the roster are three drawings without this module ever naming one of them.
 * The cells are the engine's own `abilityCells` (ADR 0016 §11), so what is drawn is exactly what the
 * server hurt or healed, the caster and the allies inside the area included (§12).
 */
function impactOf(
  state: PublicState,
  to: Position,
  effect: Effect,
  definition: AbilityDefinition,
): AbilityImpact {
  if (definition.effect.kind === 'heal') {
    return { kind: 'glow', cells: abilityCells(state, to, definition), color: effect.color };
  }

  if (definition.effect.radius === 0) return { kind: 'shot', cell: to, effect };

  return { kind: 'blast', cell: to, cells: abilityCells(state, to, definition), color: effect.color };
}

/**
 * The cues of a use of an ability (ADR 0016 §8). The event names the ability and the cell; the match's
 * own catalog says what it does there, and the cells it covers come from the engine. Nothing is played
 * for an ability the catalog does not define, for a class whose art does not exist yet, or for an actor
 * the snapshot does not know: the log still shows the event, and the board would rather draw nothing
 * than guess.
 */
function abilityCues(
  event: Extract<Event, { type: 'ability-used' }>,
  units: ReadonlyMap<string, Snapshot>,
  state: PublicState | undefined,
): Cue[] {
  if (state === undefined) return [];

  const actor = units.get(event.actor);
  if (actor === undefined) return [];

  const effects = EFFECTS[actor.primaryClass];
  if (effects === undefined) return [];

  const definition = abilityById(state.catalog, event.abilityId);
  if (definition === undefined) return [];

  // The ranged effect of the class is the one an ability is thrown with: an ability reaches across the
  // board the way a shot does, and its colour is what the aim and the blast are drawn in (EA-16, D5).
  const thrown = effects.ranged;

  return [
    {
      kind: 'ability',
      actorId: event.actor,
      cell: event.to,
      impact: impactOf(state, event.to, thrown, definition),
    },
  ];
}

/**
 * The cues of one event. An event that names a unit the snapshot does not know cues nothing: the
 * client would rather play no animation than guess at a position or a class. Only the ability needs
 * the state as well, because the cells it covers are the engine's answer about the board (EA-16).
 */
export function presentationOf(
  event: Event,
  units: ReadonlyMap<string, Snapshot>,
  state?: PublicState,
): Cue[] {
  switch (event.type) {
    case 'moved':
      return [
        {
          kind: 'move',
          unitId: event.actor,
          from: event.from,
          to: event.to,
          steps: [event.from, ...event.path],
        },
      ];

    case 'attacked': {
      const actor = units.get(event.actor);
      const target = units.get(event.target);
      if (actor === undefined || target === undefined) return [];

      const style = attackStyle(actor.position, target.position);
      const effects = EFFECTS[actor.primaryClass];
      // A class whose art does not exist yet plays nothing; the log still shows the event.
      if (effects === undefined) return [];

      return [
        {
          kind: 'attack',
          actorId: event.actor,
          targetId: event.target,
          style,
          hit: event.hit,
          effect: effects[style],
        },
      ];
    }

    case 'reloaded': {
      const actor = units.get(event.actor);
      // A class with no magazine reloads nothing, so there is no animation to play.
      if (actor === undefined || actor.magazine === null) return [];

      return [{ kind: 'reload', unitId: event.actor, from: 0, to: actor.magazine }];
    }

    case 'unit-defeated':
      return [{ kind: 'defeat', unitId: event.target }];

    case 'corpse-removed':
      return [{ kind: 'remove', unitId: event.target }];

    case 'turn-ended':
      // The point a magic pool hands back (ADR 0017) is read from the log, not drawn on the board.
    case 'regained':
      return [];

    case 'ability-used':
      return abilityCues(event, units, state);

    // The roll of a damage effect and what a heal gave back cue nothing of their own (ADR 0016 §8):
    // the impact of the use is drawn once, and the numbers are read in the log.
    case 'damaged':
    case 'healed':
      return [];

    // The four effects of the second active set carry a cue each; the drawing itself is m4. The fade
    // and the break are two cues because the scene may want to tell them apart (ADR 0023 §3), and the
    // revived unit travels to the cell the event names.
    case 'camouflage-ended':
      return [{ kind: 'camouflage-ended', unitId: event.target, reason: event.reason }];

    case 'stood-up':
      return [{ kind: 'stand-up', unitId: event.actor }];

    case 'terrain-expired':
      return [{ kind: 'terrain-expired', cells: event.cells }];

    case 'revived':
      return [{ kind: 'revive', unitId: event.target, to: event.to }];

    // A pending move taken back or confirmed (EA-5) has no animation of its own: the cancel is a
    // correction, not a walk, and the state that follows puts the figure back where it started.
    case 'move-cancelled':
    case 'move-committed':
      return [];
  }
}
