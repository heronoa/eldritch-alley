// The marks the board paints under the rules: the cells the match calls cover or wall, and the small
// badge that says which.
//
// The art of a prop comes from the client's own copy of the map (`props.ts`), which is why a car looks
// like a car. Whether the rules treat that cell as cover does not: that is the server's answer, and it
// arrives in the state (ADR 0012). The two must not be confused, or the player aims at a crate the
// engine does not see. Everything here is read from the board the match carries, never from the map.
import { MAP_COLORS } from '../../maps/prototype-palette';
import type { Board, Prop, PropKind } from '../../protocol';
import type { Pixel } from '../../view/grid';

/** How wide and how tall the badge is drawn, in the prototype's pixels. */
const MARK_HALF_WIDTH = 5;
const MARK_HALF_HEIGHT = 4;

/** The colour of each kind of mark. Two colours the maps already draw with. */
const MARK_COLOR: Readonly<Record<PropKind, string>> = {
  wall: MAP_COLORS.paper,
  cover: MAP_COLORS.neon[1],
};

/**
 * The cells the state's board marks, in the order the board lists them. A board that carries none —
 * a setup that left them out — marks nothing.
 */
export function boardMarks(board: Board): readonly Prop[] {
  return board.props ?? [];
}

/**
 * Draws the badge of one marked cell, centred on the point the cell's top face is drawn at. Called
 * after the cell and its props, so it lands over the art the way the mark the player reads should.
 */
export function drawMark(ctx: CanvasRenderingContext2D, kind: PropKind, at: Pixel): void {
  ctx.beginPath();
  ctx.moveTo(at.x, at.y - MARK_HALF_HEIGHT);
  ctx.lineTo(at.x + MARK_HALF_WIDTH, at.y);
  ctx.lineTo(at.x, at.y + MARK_HALF_HEIGHT);
  ctx.lineTo(at.x - MARK_HALF_WIDTH, at.y);
  ctx.closePath();

  ctx.fillStyle = MARK_COLOR[kind];
  ctx.fill();
  ctx.strokeStyle = MAP_COLORS.outline;
  ctx.lineWidth = 1;
  ctx.stroke();
}
