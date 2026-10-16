// The marks the board paints under the rules: the cells the match calls cover or wall.
//
// The art of a prop comes from the client's own copy of the map (`props.ts`), which is why a car looks
// like a car. Which cells the rules treat as cover does not: that is the server's answer, and it arrives
// in the state. The two must not be confused, or the player aims at a crate the engine does not see.
import { describe, expect, it } from 'vitest';
import type { Board, Prop } from '../../protocol';
import { boardMarks } from './marks';

/** An 8x8 board of flat ground carrying `props`. */
function makeBoard(props: readonly Prop[] = []): Board {
  return { width: 8, height: 8, levels: new Array<number>(64).fill(0), props };
}

function coverAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'cover' };
}

function wallAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'wall' };
}

describe('boardMarks', () => {
  it('marks the cells of the board it is handed, and only those', () => {
    expect(boardMarks(makeBoard([coverAt(2, 3), wallAt(5, 5)]))).toEqual([
      { position: { x: 2, y: 3 }, kind: 'cover' },
      { position: { x: 5, y: 5 }, kind: 'wall' },
    ]);
  });

  it('answers nothing for a board the rules carry no props on', () => {
    expect(boardMarks(makeBoard())).toEqual([]);
  });

  it('reads the board it is given, so two boards mark different cells', () => {
    // The mark is the state's, never the client's own idea of where the crates are.
    expect(boardMarks(makeBoard([coverAt(1, 1)]))).toEqual([
      { position: { x: 1, y: 1 }, kind: 'cover' },
    ]);
    expect(boardMarks(makeBoard([wallAt(6, 6)]))).toEqual([
      { position: { x: 6, y: 6 }, kind: 'wall' },
    ]);
  });
});
