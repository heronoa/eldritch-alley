// The board while the view turns (EA-12, slice 3). A cell of the map is a canvas painted once, so the
// detailed drawing cannot be re-projected at any angle but its own: the turn is passed through as this
// simplified picture instead — the cells as flat blocks, the tall buildings translucent, the units as
// billboards — and the detailed view snaps back in the moment the turn ends. A port of `animScene` of
// the prototype's `js/maps-camera.js`.
//
// One canvas over the whole view, above everything the match draws. The detailed board is painted over
// rather than taken away: at the end of the turn it is already where it belongs, and the only work left
// is to take this away.
import Phaser from 'phaser';
import { TILE_PALETTE } from '../../maps/prototype-palette';
import type { Terrain } from '../../maps/terrain';
import type { BillboardUnit } from '../../view/billboard';
import { CUTAWAY_MIN_LEVEL } from '../../view/cutaway';
import { LAYER } from '../../view/depth';
import { NO_FLOOR, type Cell } from '../../view/grid';
import { CX, HZ, PIXEL, TILE_H, TILE_W, TOP_Y } from '../../view/iso';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../view/layout';
import { rotationAngle } from '../../view/rotation-animation';
import { PAPER_COLOR, TEAM_COLOR, cssColor } from '../../view/theme';
import { drawBackdrop } from './backdrop';
import { context2d, depthOf, drawnLevel, letterOf, poly, px, type Point } from './cell';

/** How opaque a tall building the turn swings through is drawn, as the prototype draws it. */
const BUILDING_ALPHA = 0.55;

/** The flat figure a unit is drawn as while the view turns: a shadow, a body and a head. */
const SHADOW = { width: 10, height: 3, color: 'rgba(0,0,0,.4)' };
const FIGURE = { width: 12, height: 18, head: 6 };

/** Counts the turns drawn in this run, so two of them never ask Phaser for the same texture key. */
let turns = 0;

/** Where the turn stands: the point the board swings about, and the two numbers of the swing. */
interface Swing {
  cx: number;
  cy: number;
  cos: number;
  sin: number;
}

export class RotationView {
  private readonly scene: Phaser.Scene;
  private readonly terrain: Terrain;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  /** The units of the match by the view cell they stand on, so a cell's block can carry its figure. */
  private readonly standing: Map<string, BillboardUnit>;
  /** How far the view swings over the whole turn, in degrees: a quarter turn, signed by the way. */
  private readonly degrees: number;
  /** Set by every `draw`, and read by the projection of that same drawing. */
  private swing: Swing = { cx: 0, cy: 0, cos: 1, sin: 0 };

  /**
   * `units` are the units as the view being turned away from sees them, and `degrees` is where the
   * turn arrives — a quarter turn to one side or the other, signed.
   */
  constructor(scene: Phaser.Scene, terrain: Terrain, units: readonly BillboardUnit[], degrees: number) {
    this.scene = scene;
    this.terrain = terrain;
    this.degrees = degrees;
    this.standing = new Map(units.map((unit) => [`${unit.position.x},${unit.position.y}`, unit]));

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    this.ctx = context2d(canvas);

    const key = `ea-turn-${(turns += 1)}`;
    const texture = scene.textures.addCanvas(key, canvas);
    if (texture === null) throw new Error(`the texture manager refused the canvas ${key}`);

    this.texture = texture;
    this.image = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(LAYER.overlay);
  }

  /**
   * Draws the board at the angle the turn has reached after `elapsedMs`: nothing at the start, a
   * quarter turn at the end, eased in between.
   */
  draw(elapsedMs: number): void {
    const { terrain } = this;
    const phi = (rotationAngle(0, this.degrees, elapsedMs) * Math.PI) / 180;

    this.swing = {
      cx: terrain.size.width / 2,
      cy: terrain.size.height / 2,
      cos: Math.cos(phi),
      sin: Math.sin(phi),
    };

    drawBackdrop(this.ctx, terrain.map.sky, CANVAS_WIDTH, CANVAS_HEIGHT, 0);

    // Back to front, the order the drawing goes in: the further down the canvas a cell lands while the
    // board swings, the nearer the eye, and the later it is drawn over the others.
    const swung: { cell: Cell; level: number; near: number }[] = [];
    for (let y = 0; y < terrain.size.height; y += 1) {
      for (let x = 0; x < terrain.size.width; x += 1) {
        const cell = { x, y };
        // The drawn level, not the map's: a building the view cuts down is short here too, so the
        // picture the turn starts from is the one already on the screen. A gap still has no floor.
        const level = drawnLevel(terrain, cell);
        if (level === NO_FLOOR) continue;

        const middle = this.turned(x + 0.5, y + 0.5);
        swung.push({ cell, level, near: middle[0] + middle[1] });
      }
    }
    swung.sort((left, right) => left.near - right.near);

    for (const { cell, level } of swung) this.drawBlock(cell, level);
    this.texture.refresh();
  }

  /** Takes the canvas out of the scene and out of the texture manager. */
  destroy(): void {
    this.image.destroy();
    this.scene.textures.remove(this.texture.key);
  }

  /** One cell as a flat block: the walls the eye sees, the top face over them, and what stands on it. */
  private drawBlock(cell: Cell, level: number): void {
    const { ctx, terrain } = this;
    const letter = letterOf(terrain, cell);
    const face = TILE_PALETTE[letter] ?? TILE_PALETTE.B;

    // The four corners of the top face, clockwise from the top of the diamond.
    const corners: Point[] = [
      this.project(cell.x, cell.y, level),
      this.project(cell.x + 1, cell.y, level),
      this.project(cell.x + 1, cell.y + 1, level),
      this.project(cell.x, cell.y + 1, level),
    ];
    const middle = this.project(cell.x + 0.5, cell.y + 0.5, level);
    const drop = depthOf(terrain, cell) * PIXEL;

    // A building tall enough to be looked over is drawn see-through, exactly as it is when the view
    // stands still (slice 4): the same rule, without the hatch that says why.
    ctx.globalAlpha = letter === 'B' && level >= CUTAWAY_MIN_LEVEL ? BUILDING_ALPHA : 1;

    for (let i = 0; i < corners.length; i += 1) {
      const from = corners[i];
      const to = corners[(i + 1) % corners.length];
      // Only the walls below the middle of the top face are on the near side of the block: the two
      // behind it are hidden by the top face itself, and drawing them would only show through.
      if ((from[1] + to[1]) / 2 <= middle[1]) continue;

      const left = (from[0] + to[0]) / 2 < middle[0];
      poly(ctx, [from, to, [to[0], to[1] + drop], [from[0], from[1] + drop]], left ? face.left : face.right);
    }

    poly(ctx, corners, face.top);
    ctx.globalAlpha = 1;

    this.drawFigure(cell, middle);
  }

  /** The unit standing on a cell, as a flat figure facing the camera, or nothing at all. */
  private drawFigure(cell: Cell, middle: Point): void {
    const unit = this.standing.get(`${cell.x},${cell.y}`);
    if (unit === undefined) return;

    const { ctx } = this;
    const [x, y] = middle;
    const half = FIGURE.width / 2;
    const shoulders = y - FIGURE.height;

    px(ctx, x - SHADOW.width / 2, y - SHADOW.height / 2, SHADOW.width, SHADOW.height, SHADOW.color);
    // The paper is what makes a figure read over a dark tile as well as a light one, as the sprite's
    // own outline does when the view stands still.
    const paper = cssColor(PAPER_COLOR);
    px(ctx, x - half - 1, shoulders - 1, FIGURE.width + 2, FIGURE.height + 1, paper);
    px(ctx, x - half, shoulders, FIGURE.width, FIGURE.height, cssColor(TEAM_COLOR[unit.team]));
    px(ctx, x - FIGURE.head / 2 - 1, shoulders - FIGURE.head - 1, FIGURE.head + 2, FIGURE.head + 1, paper);
  }

  /**
   * A board coordinate as the turn has swung it, about the middle of the board. At the two ends of the
   * turn this is the identity and the quarter turn the view is arriving at, so the picture the turn
   * starts from and the one it lands on are the two views themselves.
   */
  private turned(u: number, v: number): Point {
    const { cx, cy, cos, sin } = this.swing;
    const du = u - cx;
    const dv = v - cy;

    return [cx + du * cos - dv * sin, cy + du * sin + dv * cos];
  }

  /** Where a board coordinate lands on the canvas at a level, with the board swung as it is now. */
  private project(u: number, v: number, level: number): Point {
    const [a, b] = this.turned(u, v);

    return [
      CX + ((a - b) * TILE_W) / 2,
      TOP_Y + ((a + b) * TILE_H) / 2 - level * HZ + this.terrain.lift * PIXEL,
    ];
  }
}
