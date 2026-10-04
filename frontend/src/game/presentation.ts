// What one server event looks like on the board: the list of cues the scene plays.
//
// The presentation never changes the outcome — the server already fixed it. This module is pure, so
// every rule that picks an animation is testable without a browser, and the scene only draws.
import type { Event, Position } from '../protocol';
import { EFFECTS, attackStyle, type Effect } from '../view/effects';

/** One thing to play. The scene reads the cue; nothing here touches Phaser. */
export type Cue =
  | { kind: 'move'; unitId: string; from: Position; to: Position }
  | {
      kind: 'attack';
      actorId: string;
      targetId: string;
      style: 'melee' | 'ranged';
      hit: boolean;
      effect: Effect;
    }
  | { kind: 'reload'; unitId: string; from: number; to: number }
  | { kind: 'defeat'; unitId: string }
  | { kind: 'remove'; unitId: string };

/** What the client knew about a unit when the event was played. */
export interface Snapshot {
  position: Position;
  primaryClass: string;
  magazine: number | null;
}

/**
 * The cues of one event. An event that names a unit the snapshot does not know cues nothing: the
 * client would rather play no animation than guess at a position or a class.
 */
export function presentationOf(event: Event, units: ReadonlyMap<string, Snapshot>): Cue[] {
  switch (event.type) {
    case 'moved':
      return [{ kind: 'move', unitId: event.actor, from: event.from, to: event.to }];

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
      return [];
  }
}
