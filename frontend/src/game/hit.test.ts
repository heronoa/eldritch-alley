import { describe, expect, it } from 'vitest';
import type { Board, Position, UnitId } from '../protocol';
import { cellAt, cellToScreen } from '../view/iso';
import { SPRITE_SIZE } from '../view/unit-look';
import { HIT_MARGIN_PX, unitAtPoint, type HitUnit, type SpriteLayout } from './hit';

const BOARD: Board = { width: 8, height: 8, levels: new Array<number>(64).fill(0) };

/** A unit of the board, as the hit test reads it: where it stands, and whether it is still drawn. */
type TestUnit = HitUnit & { id: UnitId };

function unit(id: UnitId, at: Position, permanentlyDead = false): TestUnit {
  return { id, position: at, permanentlyDead };
}

/** The board's own projection, so the points below are the ones the scene hands over. */
function layout(margin = HIT_MARGIN_PX): SpriteLayout {
  return { anchorOf: (of) => cellToScreen(of.position, 0), margin };
}

describe('unitAtPoint', () => {
  /** On the flat board: its feet at the centre of (3,3)'s top face, its body standing over it. */
  const SNIPER = unit('A-sniper', { x: 3, y: 3 });
  const FEET = cellToScreen(SNIPER.position, 0);

  /** A point of the sprite: `above` the feet, `sideways` from the middle of the figure. */
  const onSprite = (above: number, sideways = 0) => ({ x: FEET.x + sideways, y: FEET.y - above });

  it('finds the unit whose body the point lands on, over a cell that is not its own', () => {
    const chest = onSprite(SPRITE_SIZE.height / 2);

    // What the playtest found: the figure is drawn over the cells behind the one it stands on, so a
    // point on the body is a point on no cell of its own (DT-61 keeps the cell under the wall instead).
    expect(cellAt(chest, BOARD, () => 0)).not.toEqual(SNIPER.position);
    expect(unitAtPoint([SNIPER], chest, layout())).toBe(SNIPER);
  });

  it('counts a point up to the margin outside the figure, and nothing past it', () => {
    const edge = onSprite(SPRITE_SIZE.height / 2, -SPRITE_SIZE.width / 2 - HIT_MARGIN_PX);

    expect(unitAtPoint([SNIPER], edge, layout())).toBe(SNIPER);
    expect(unitAtPoint([SNIPER], { x: edge.x - 1, y: edge.y }, layout())).toBeNull();
  });

  it('answers the unit drawn on top when two sprites overlap', () => {
    // The priest stands one cell nearer the viewer, so it is drawn over the sniper (see `depthOfUnit`).
    const priest = unit('B-priest', { x: 4, y: 3 });
    // The sniper's right shoulder, which is where the body of the priest is drawn as well.
    const both = onSprite(SPRITE_SIZE.height / 2, SPRITE_SIZE.width / 2);

    expect(unitAtPoint([SNIPER, priest], both, layout())).toBe(priest);
    // The order the units are read in is the state's, so it must not decide the answer.
    expect(unitAtPoint([priest, SNIPER], both, layout())).toBe(priest);
  });

  it('answers nothing where no sprite is drawn', () => {
    // A body removed for good is not drawn at all: its old ground is empty, and a press there is a
    // press on the cell, which is what lets the unit walk onto it (EA-8 keeps the two answers apart).
    const removed = unit('B-priest', { x: 5, y: 3 }, true);
    const whereItStood = cellToScreen(removed.position, 0);

    expect(unitAtPoint([removed], { x: whereItStood.x, y: whereItStood.y - 10 }, layout())).toBeNull();
    expect(unitAtPoint([SNIPER], { x: FEET.x, y: FEET.y + SPRITE_SIZE.height }, layout())).toBeNull();
  });
});
