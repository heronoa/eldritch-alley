// The badge a unit in cover wears over its head: which sides of it carry a cover prop, and the words
// the HUD writes for them.
//
// The rule itself is the engine's (`cover.ts`); this module only reads the board around a unit, which
// is what the badge needs and what `coverFor` cannot answer without an attacker. The last test of the
// file pins the two together, so the badge cannot drift away from the rule it describes.
import { describe, expect, it } from 'vitest';
import { coverFor } from '@eldritch-alley/engine';
import { setLocale } from '../i18n/translate';
import type { Board, Position, Prop } from '../protocol';
import { COVER_SIDES, coverSentence, coverSides, type CoverSide } from './coverBadge';

/** A flat 8x8 board carrying `props`, the shape every other frontend test builds. */
function makeBoard(props: readonly Prop[] = []): Board {
  return { width: 8, height: 8, levels: new Array<number>(64).fill(0), props };
}

function coverAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'cover' };
}

function wallAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'wall' };
}

/** Where each side is, in the board's own frame: north is towards row 0 and east is towards +x. */
const OFFSET: Record<CoverSide, Position> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
};

/** The eight cells around one, the offsets the engine calls AROUND and the badge calls its sides. */
const AROUND: readonly Position[] = COVER_SIDES.map((side) => OFFSET[side]);

/** The unit every case is about, well inside the board so no side falls off it. */
const TARGET: Position = { x: 4, y: 4 };

function beside(offset: Position): Position {
  return { x: TARGET.x + offset.x, y: TARGET.y + offset.y };
}

describe('coverSides', () => {
  it('answers no side for a unit with no prop around it', () => {
    expect(coverSides(makeBoard(), TARGET)).toEqual([]);
    expect(coverSides(makeBoard([coverAt(2, 2)]), TARGET)).toEqual([]);
  });

  it('names the side of the prop standing beside the unit', () => {
    for (const side of COVER_SIDES) {
      const at = beside(OFFSET[side]);
      expect(coverSides(makeBoard([coverAt(at.x, at.y)]), TARGET), side).toEqual([side]);
    }
  });

  it('names every side that carries one, clockwise, whatever order the board lists them in', () => {
    const board = makeBoard([coverAt(3, 4), coverAt(5, 4), coverAt(4, 3)]);

    expect(coverSides(board, TARGET)).toEqual(['north', 'east', 'west']);
  });

  it('counts only the eight cells around the unit', () => {
    expect(coverSides(makeBoard([coverAt(6, 4)]), TARGET)).toEqual([]);
    expect(coverSides(makeBoard([coverAt(4, 6)]), TARGET)).toEqual([]);
  });

  it('never counts the prop the unit itself stands on, which is a place to be seen from', () => {
    // Standing on top of the crate is not standing behind it (ADR 0013): only the neighbours count,
    // and the ones that carry a prop still do.
    const board = makeBoard([coverAt(TARGET.x, TARGET.y), coverAt(TARGET.x - 1, TARGET.y)]);

    expect(coverSides(board, TARGET)).toEqual(['west']);
  });

  it('never counts a wall, which blocks the line instead of lowering the chance to hit', () => {
    const board = makeBoard([wallAt(TARGET.x + 1, TARGET.y), wallAt(TARGET.x, TARGET.y - 1)]);

    expect(coverSides(board, TARGET)).toEqual([]);
  });

  it('leaves out the sides that fall off the edge of the board, without failing', () => {
    // A unit in the north-west corner: west, north-west and north are off the board, and the props on
    // the cells that do exist are read as always.
    const corner = { x: 0, y: 0 };
    const board = makeBoard([coverAt(1, 0), coverAt(0, 1), coverAt(1, 1)]);

    expect(coverSides(board, corner)).toEqual(['east', 'southeast', 'south']);
  });

  it('reads the board without changing it', () => {
    const props = [coverAt(5, 4), wallAt(4, 3)];
    const board = makeBoard(props);

    coverSides(board, TARGET);
    coverSentence(board, TARGET);

    expect(board.props).toEqual(props);
  });
});

describe('coverSentence', () => {
  it('says nothing for a unit with no cover around it', () => {
    expect(coverSentence(makeBoard(), TARGET)).toBeNull();
    expect(coverSentence(makeBoard([coverAt(TARGET.x, TARGET.y)]), TARGET)).toBeNull();
  });

  it('names the side, in the player language', () => {
    const board = makeBoard([coverAt(TARGET.x + 1, TARGET.y)]);

    setLocale('pt-BR');
    expect(coverSentence(board, TARGET)).toBe('Em cobertura a leste');

    setLocale('en-US');
    expect(coverSentence(board, TARGET)).toBe('In cover for East');

    setLocale('pt-BR');
  });

  it('lists every side that carries one, joined the way the language joins a list', () => {
    const board = makeBoard([coverAt(TARGET.x, TARGET.y - 1), coverAt(TARGET.x + 1, TARGET.y)]);

    setLocale('pt-BR');
    expect(coverSentence(board, TARGET)).toBe('Em cobertura a norte e leste');

    setLocale('en-US');
    expect(coverSentence(board, TARGET)).toBe('In cover for North and East');

    setLocale('pt-BR');
  });
});

/**
 * The badge and the rule are two readings of one board: the badge names where the cover stands, and
 * `coverFor` reads the same list from the other end. For an attacker on one of the eight neighbouring
 * cells, the crate it counts is the one on its own side of the target — the three sides of its fan —
 * and never the cell the attacker itself stands on. The two must agree on every board.
 */
describe('the badge against the rule it describes', () => {
  const BOARDS: readonly [string, readonly Prop[]][] = [
    ['nothing', []],
    ['a crate to the west', [coverAt(3, 4)]],
    ['a crate to the north-east', [coverAt(5, 3)]],
    ['a crate under the target', [coverAt(4, 4)]],
    ['a crate where an attacker may stand', [coverAt(5, 4)]],
    ['a wall to the south', [wallAt(4, 5)]],
  ];

  it('names a side exactly when the rule gives cover against an attacker on that side', () => {
    for (const [name, props] of BOARDS) {
      const board = makeBoard(props);
      const sides = coverSides(board, TARGET);

      for (const step of AROUND) {
        const attacker = beside(step);
        const counted = sides.some((side) => {
          const offset = OFFSET[side];
          const facing = offset.x * step.x + offset.y * step.y > 0;
          const underTheAttacker = offset.x === step.x && offset.y === step.y;

          return facing && !underTheAttacker;
        });

        expect(coverFor(board, TARGET, attacker), `${name}, attacker at ${attacker.x},${attacker.y}`).toBe(
          counted,
        );
      }
    }
  });
});
