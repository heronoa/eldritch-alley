// Which basic attack a unit throws, and what it looks like. Distance never changes the damage or
// the cost (rule of the prototype); it only picks the animation and the effect.
import type { Position } from '../protocol';
import { PAPER_COLOR, WARM_COLOR } from './theme';

/** One effect the scene can draw. `staggerMs` is the delay between the copies of a multi-shot. */
export interface Effect {
  kind: string;
  travelMs: number;
  color: number;
  staggerMs: number;
}

/** Neon belongs to magic. Magenta is the arcane, cyan is the faith, and nothing else uses them. */
const ARCANE_NEON = 0xff3df2;
const FAITH_NEON = 0x3de9ff;

function effect(kind: string, travelMs: number, color: number, staggerMs = 0): Effect {
  return { kind, travelMs, color, staggerMs };
}

/**
 * The basic attack of each class of the roster, at reach and at range. A class the engine adds
 * later has no entry until its art exists, and then nothing is played for it.
 */
export const EFFECTS: Readonly<Record<string, { melee: Effect; ranged: Effect }>> = {
  sniper: {
    melee: effect('pistol-flash', 0, WARM_COLOR),
    ranged: effect('tracer', 140, WARM_COLOR),
  },
  wizard: {
    melee: effect('gust', 0, PAPER_COLOR),
    ranged: effect('missiles', 520, ARCANE_NEON, 70),
  },
  priest: {
    melee: effect('glow-impact', 0, FAITH_NEON),
    ranged: effect('sky-column', 300, FAITH_NEON),
  },
};

/** The attack a unit throws at a target: the melee one when adjacent, the ranged one beyond that. */
export function attackStyle(actor: Position, target: Position): 'melee' | 'ranged' {
  const distance = Math.max(Math.abs(actor.x - target.x), Math.abs(actor.y - target.y));
  return distance <= 1 ? 'melee' : 'ranged';
}
