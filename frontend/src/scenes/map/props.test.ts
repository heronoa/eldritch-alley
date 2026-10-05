// Map fidelity M2 — the drawers of the prototype's props.
//
// The test environment has no canvas (vitest runs in node, see `vitest.config.ts`), so the drawers
// are held to what they ask the context to do: a recording stand-in takes the place of the context
// and every call is written down. That is enough for the two things M2 has to guarantee — no prop
// of the three maps is missing a drawer, and a drawer depends on nothing but its own arguments.
import { describe, expect, it } from 'vitest';
import type { Pixel } from '../../view/grid';
import { PROTOTYPE_MAPS, type PropSpec } from '../../maps/prototype-maps';
import { PROP_DRAWERS, drawProp } from './props';

/** One recorded interaction: the member that was used and what it was given. */
type Call = [string, ...unknown[]];

/** Where every prop is drawn in the test: the centre of its cell's top face, at some canvas point. */
const AT: Pixel = { x: 100, y: 100 };

/** A moment of the animation, in seconds, as `app.js` counts it. */
const TIME = 1.5;

/** Every prop type the three maps place, in a stable order. */
const TYPES: readonly string[] = [
  ...new Set(PROTOTYPE_MAPS.flatMap((map) => map.props.map((prop) => prop.t))),
].sort();

/** Every prop the three maps place, with the map it belongs to, for a readable failure message. */
const PROPS: readonly { map: string; prop: PropSpec }[] = PROTOTYPE_MAPS.flatMap((map) =>
  map.props.map((prop) => ({ map: map.id, prop })),
);

/** A prop is named by its type and the cell it sits on. */
function where(prop: PropSpec): string {
  return `${prop.t} at ${prop.x},${prop.y}`;
}

/**
 * A stand-in for a canvas context that writes down every call instead of painting, and answers the
 * gradient builders with an object that records its own stops. A drawer that paints nothing leaves
 * an empty record, which is exactly the failure the coverage test looks for.
 *
 * A value the drawer hands back to the context is written down by what it is rather than by the object
 * itself: two gradients alike are still two objects, and the record is of what a drawer asked for, not
 * of the instance it asked with. The stops of a gradient are recorded as they are added.
 */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const gradient = new Proxy(
    {},
    {
      get: (_target, key) =>
        (...args: unknown[]) => {
          calls.push([`gradient.${String(key)}`, ...args]);
        },
    },
  );

  /** One value a drawer set, as the record keeps it. */
  const recorded = (value: unknown): unknown =>
    typeof value === 'object' && value !== null ? '<gradient>' : value;

  const ctx = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (typeof key !== 'string') return undefined;
        return (...args: unknown[]) => {
          calls.push([key, ...args]);
          return key.startsWith('create') ? gradient : undefined;
        };
      },
      set: (_target, key, value) => {
        calls.push([`= ${String(key)}`, recorded(value)]);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;

  return { ctx, calls };
}

describe('prop drawers', () => {
  it('covers every prop type the three maps use', () => {
    expect(TYPES.length).toBeGreaterThan(20);

    for (const type of TYPES) {
      expect(PROP_DRAWERS[type], type).toBeTypeOf('function');
    }
  });

  it('paints every prop the three maps place', () => {
    for (const { prop } of PROPS) {
      const { ctx, calls } = recorder();
      drawProp(ctx, prop, AT, TIME);

      expect(calls.length, where(prop)).toBeGreaterThan(0);
    }
  });

  it('refuses a prop type it has no drawer for', () => {
    const { ctx } = recorder();

    expect(() => drawProp(ctx, { t: 'portal', x: 0, y: 0 }, AT, TIME)).toThrow(
      /no drawer for prop portal/,
    );
  });

  it('draws the same prop at the same time the same way, twice running', () => {
    // Nothing a drawer touches may come from anywhere but its own arguments: no clock, no random
    // source, no state kept between frames. Otherwise a repaint of the map would not match the first.
    for (const { prop } of PROPS) {
      const first = recorder();
      const second = recorder();

      drawProp(first.ctx, prop, AT, TIME);
      drawProp(second.ctx, prop, AT, TIME);

      expect(second.calls, where(prop)).toEqual(first.calls);
    }
  });

  it('moves with the time it is given', () => {
    // The animated props — a lamp's light, a leak's sparks, the traffic light — are repainted every
    // frame, so a drawer that ignores the time would stand still.
    const animated = PROPS.filter(({ prop }) =>
      ['lamp', 'leak', 'traffic', 'antenna', 'manhole', 'fountain', 'puddle', 'chimney'].includes(prop.t),
    );

    for (const { prop } of animated) {
      const early = recorder();
      const late = recorder();

      // Four seconds apart, so even the traffic light — which changes every three — has moved.
      drawProp(early.ctx, prop, AT, 1);
      drawProp(late.ctx, prop, AT, 4);

      expect(late.calls, where(prop)).not.toEqual(early.calls);
    }
  });
});
