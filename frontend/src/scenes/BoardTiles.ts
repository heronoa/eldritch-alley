// The board as isometric blocks: one `Graphics` per cell, each carrying the depth of its own cell so
// the blocks in front cover the ones behind. Only the cells whose level changed are redrawn.
//
// It decides nothing: the board comes from the state, the geometry and the shading from `view/iso.ts`
// and the colours from `view/grid.ts` and `view/theme.ts`.
import Phaser from 'phaser';
import type { Board } from '../protocol';
import { heightColor, type Cell } from '../view/grid';
import { HZ, depthOfCell, topFace } from '../view/iso';
import { FACE_COLORS, GRID_STROKE_COLOR } from '../view/theme';

/** A level no cell can have, so the first `sync` draws every cell instead of assuming zero. */
const UNKNOWN_LEVEL = Number.NaN;

export class BoardTiles {
  private readonly tiles: Phaser.GameObjects.Graphics[] = [];
  /** The level each cell was last drawn at, so `sync` only redraws what changed. */
  private readonly drawn: number[] = [];
  /** The board these tiles were built for, and the one their cells are indexed by. */
  private readonly board: Board;

  constructor(scene: Phaser.Scene, board: Board, levelAt: (cell: Cell) => number) {
    this.board = board;

    for (let y = 0; y < board.height; y += 1) {
      for (let x = 0; x < board.width; x += 1) {
        const cell = { x, y };
        this.tiles.push(scene.add.graphics().setDepth(depthOfCell(cell)));
        this.drawn.push(UNKNOWN_LEVEL);
      }
    }

    this.sync(levelAt);
  }

  /** Whether these tiles are the ones drawn for `board`. */
  fits(board: Board): boolean {
    return this.board.width === board.width && this.board.height === board.height;
  }

  /** Redraws only the cells whose level changed since the last call. */
  sync(levelAt: (cell: Cell) => number): void {
    for (let y = 0; y < this.board.height; y += 1) {
      for (let x = 0; x < this.board.width; x += 1) {
        const index = y * this.board.width + x;
        const level = levelAt({ x, y });
        if (level === this.drawn[index]) continue;

        this.drawn[index] = level;
        this.draw(index, { x, y }, level);
      }
    }
  }

  /** Takes every tile out of the scene, for when a state carries a board of another size. */
  destroy(): void {
    for (const tile of this.tiles) tile.destroy();
    this.tiles.length = 0;
    this.drawn.length = 0;
  }

  /**
   * A cell: the two side faces of its block, then its top face over them. A cell on the ground has no
   * block under it, so it is only its top face.
   */
  private draw(index: number, cell: Cell, level: number): void {
    const tile = this.tiles[index];
    const face = topFace(cell, level);
    // The north corner is already in `face`; only the other three are named, for the two side faces.
    const [, east, south, west] = face;
    const top = heightColor(level);
    const sides = FACE_COLORS[level];
    const drop = level * HZ;

    tile.clear();
    tile.lineStyle(1, GRID_STROKE_COLOR, 1);

    if (level > 0) {
      // The west and south corners are the near ones, so the faces between them are the two the
      // viewer sees: the left face under `W S` and the right face under `S E`.
      const left = [west, south, { x: south.x, y: south.y + drop }, { x: west.x, y: west.y + drop }];
      const right = [south, east, { x: east.x, y: east.y + drop }, { x: south.x, y: south.y + drop }];

      tile.fillStyle(sides.left, 1);
      tile.fillPoints(left, true);
      tile.strokePoints(left, true, true);

      tile.fillStyle(sides.right, 1);
      tile.fillPoints(right, true);
      tile.strokePoints(right, true, true);
    }

    // The top face goes over the two of them, in its own colour.
    tile.fillStyle(top, 1);
    tile.fillPoints(face, true);
    tile.strokePoints(face, true, true);
  }
}
