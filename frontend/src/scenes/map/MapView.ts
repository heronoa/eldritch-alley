// The map of a match, drawn: the backdrop, one canvas per cell and the two overlays that hang over the
// whole board. A port of the render loop of the prototype's `js/app.js`.
//
// Every drawing module works in the prototype's own pixels, on canvases of its own; this is the one
// that puts them on the scene, at `PIXEL` times their size, each at the depth that decides what covers
// what. A cell is a canvas rather than a `Graphics` because the prototype's drawing is made of
// hundreds of one-pixel marks and gradients, which a canvas takes in one pass.
//
// A cell is drawn twice over: what stands still goes into a canvas painted once, and what moves — a
// lamp's light, a leak's sparks, the park's water — into a second one painted every frame. The two
// share a depth and a position, so the moving drawing lands exactly over the still one. The prototype
// redraws everything every frame; this is the same picture for a fraction of the work.
import Phaser from 'phaser';
import type { PropSpec } from '../../maps/prototype-maps';
import { propsAt, type Terrain } from '../../maps/terrain';
import type { Prop } from '../../protocol';
import type { Cell, Pixel } from '../../view/grid';
import { NO_FLOOR } from '../../view/grid';
import { LAYER } from '../../view/depth';
import { PIXEL, cellToScreen } from '../../view/iso';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../view/layout';
import { COVERED_ALPHA } from '../../view/cutaway';
import { drawBackdrop } from './backdrop';
import { cellBox, context2d, depthOf, drawCell, drawCellAnimation, drawnLevel, movesOverTime, px } from './cell';
import { drawMark } from './marks';
import { drawProp, isAnimatedProp, propsInPaintOrder } from './props';

/** How far a wire hangs over the street, and a clothesline over the gap, in the prototype's pixels. */
const WIRE_LIFT = 23;
const LINE_LIFT = 18;

/** The overlay covers the whole canvas, so a wire that runs off the board still has somewhere to go. */
const VIEW_WIDTH = CANVAS_WIDTH / PIXEL;
const VIEW_HEIGHT = CANVAS_HEIGHT / PIXEL;

/** The top-left corner of a canvas that covers the whole view. */
const CORNER: Pixel = { x: 0, y: 0 };

/**
 * One canvas of the scene, with the context it is drawn on. The key is how Phaser finds it again, and
 * what has to be removed when the map goes away.
 */
interface Layer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly image: Phaser.GameObjects.Image;
}

/** One cell's moving canvas, with everything the next frame needs to paint it again. */
interface MovingCell {
  readonly layer: Layer;
  readonly cell: Cell;
  readonly at: Pixel;
  readonly props: readonly PropSpec[];
  /** Whether the cell's own tile moves. Only the park's water does. */
  readonly tileMoves: boolean;
}

/** Counts the maps drawn in this run, so two of them never ask Phaser for the same texture key. */
let views = 0;

export class MapView {
  private readonly scene: Phaser.Scene;
  private readonly terrain: Terrain;
  /** The cells the state's board marks, by cell, so a cell can be drawn with its own badge. */
  private readonly marks: ReadonlyMap<string, Prop>;
  private readonly layers: Layer[] = [];
  private readonly moving: MovingCell[] = [];
  /** The clotheslines, painted every frame: they sway. Null on a map without one. */
  private readonly lines: Layer | null;
  /** One cell's canvases by the cell they draw, so a cell can be drawn translucent on its own. */
  private readonly cellLayers = new Map<string, Layer[]>();
  /** The cells drawn translucent now, so the next call can put them back to solid. */
  private covered: Cell[] = [];

  /**
   * `marks` are the cells the state's board calls cover or wall (ADR 0012). They are read from the state
   * and not from the map the view draws with: the map says what a cell looks like, the state says what a
   * shot at it costs, and the two answers come from different places on purpose.
   */
  constructor(scene: Phaser.Scene, terrain: Terrain, marks: readonly Prop[] = []) {
    this.scene = scene;
    this.terrain = terrain;
    this.marks = new Map(marks.map((mark) => [`${mark.position.x},${mark.position.y}`, mark]));

    const prefix = `ea-map-${(views += 1)}`;

    // The depth decides what covers what, so the order these are built in does not matter.
    this.layer(`${prefix}-sky`, VIEW_WIDTH, VIEW_HEIGHT, LAYER.backdrop, CORNER, CORNER, (ctx) =>
      drawBackdrop(ctx, terrain.map.sky, VIEW_WIDTH, VIEW_HEIGHT, 0),
    );
    this.layer(`${prefix}-wires`, VIEW_WIDTH, VIEW_HEIGHT, LAYER.overlay, CORNER, CORNER, (ctx) =>
      this.drawWires(ctx),
    );
    this.lines =
      terrain.decor.lines.length === 0
        ? null
        : this.layer(`${prefix}-lines`, VIEW_WIDTH, VIEW_HEIGHT, LAYER.overlay, CORNER, CORNER, () => {});

    for (let y = 0; y < terrain.size.height; y += 1) {
      for (let x = 0; x < terrain.size.width; x += 1) {
        const cell = { x, y };
        // A gap has no floor, so there is nothing to draw: no diamond seven steps down, no car light
        // crossing it. Decision 7 of the feature. A building the view cuts down is drawn lower than it
        // stands, which is why the level read here is the drawn one (EA-12, slice 4).
        const level = drawnLevel(terrain, cell);
        if (level === NO_FLOOR) continue;

        this.addCell(`${prefix}-${x}-${y}`, cell, level);
      }
    }

    this.update(0);
  }

  /**
   * Draws the given cells translucent and every other cell solid, so a building the player cannot see
   * through shows what it hides (EA-12, slice 4). The cells are the ones the scene worked out with the
   * rules of `view/cutaway.ts`; the view does not decide them.
   */
  setCovered(cells: readonly Cell[]): void {
    for (const cell of this.covered) this.setCellAlpha(cell, 1);
    this.covered = [...cells];
    for (const cell of this.covered) this.setCellAlpha(cell, COVERED_ALPHA);
  }

  /** Repaints what moves: the cells with an animated prop, the water, and the clotheslines. */
  update(timeMs: number): void {
    const seconds = timeMs / 1000;

    for (const cell of this.moving) this.paint(cell, seconds);
    if (this.lines !== null) {
      const { ctx } = this.lines;
      ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
      for (const span of this.terrain.decor.lines) this.drawLine(ctx, span.from, span.to, seconds);
      this.lines.texture.refresh();
    }
  }

  /** Takes every canvas of this map out of the scene and out of the texture manager. */
  destroy(): void {
    for (const layer of this.layers) {
      layer.image.destroy();
      this.scene.textures.remove(layer.texture.key);
    }

    this.layers.length = 0;
    this.moving.length = 0;
    this.cellLayers.clear();
    this.covered = [];
  }

  /** Sets how opaque the canvases of one cell are drawn. A cell with no canvas is nothing to do. */
  private setCellAlpha(cell: Cell, alpha: number): void {
    for (const layer of this.cellLayers.get(`${cell.x},${cell.y}`) ?? []) layer.image.setAlpha(alpha);
  }

  /** One cell: its still canvas, and its moving one when it has anything that moves. */
  private addCell(key: string, cell: Cell, level: number): void {
    const { terrain } = this;
    const box = cellBox(depthOf(terrain, cell));
    const at = cellToScreen(cell, level, terrain.lift);
    const depth = LAYER.board(cell);
    const { anchor } = box;

    // A cell's props are drawn in the prototype's own order, so a prop that shares a cell with another
    // lands over or under it exactly as it does there.
    const props = propsInPaintOrder(propsAt(terrain, cell));
    const still = props.filter((prop) => !isAnimatedProp(prop.t));
    const moving = props.filter((prop) => isAnimatedProp(prop.t));
    const tileMoves = movesOverTime(terrain, cell);

    const mark = this.marks.get(`${cell.x},${cell.y}`);

    const canvases: Layer[] = [
      this.layer(`${key}-still`, box.width, box.height, depth, at, anchor, (ctx) => {
        drawCell({ ctx, terrain, cell, at: anchor, time: 0 });
        for (const prop of still) drawProp(ctx, prop, anchor, 0);
        // The badge of the rules goes over the art, because what it says is what a shot at this cell
        // costs — the one thing about the cell the player cannot read off the drawing itself.
        if (mark !== undefined) drawMark(ctx, mark.kind, anchor);
      }),
    ];

    if (moving.length > 0 || tileMoves) {
      const layer = this.layer(`${key}-moving`, box.width, box.height, depth, at, anchor, () => {});
      this.moving.push({ layer, cell, at: anchor, props: moving, tileMoves });
      canvases.push(layer);
    }

    this.cellLayers.set(`${cell.x},${cell.y}`, canvases);
  }

  /**
   * One cell's moving canvas, from nothing: the whole canvas is cleared first, because what a prop
   * drew at one moment is not what it draws at the next.
   */
  private paint(cell: MovingCell, seconds: number): void {
    const { ctx, canvas } = cell.layer;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawing = { ctx, terrain: this.terrain, cell: cell.cell, at: cell.at, time: seconds };
    if (cell.tileMoves) drawCellAnimation(drawing);
    for (const prop of cell.props) drawProp(ctx, prop, cell.at, seconds);

    cell.layer.texture.refresh();
  }

  /**
   * The wires strung over the street: each from the top of one cell to the top of another, sagging in
   * between. Their two ends are the cells `data.js` names; a wire that ends off the floor is not drawn,
   * which no map asks for today.
   */
  private drawWires(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = 'rgba(10,12,20,.9)';
    ctx.lineWidth = 1;

    for (const span of this.terrain.decor.wires) {
      const from = this.overheadPoint(span.from, WIRE_LIFT);
      const to = this.overheadPoint(span.to, WIRE_LIFT);
      if (from === null || to === null) continue;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.quadraticCurveTo((from.x + to.x) / 2, Math.max(from.y, to.y) + 10, to.x, to.y);
      ctx.stroke();
    }
  }

  /**
   * The clothesline between two rooftops: the cord, and the washing hung along it, each piece swaying
   * with the same pass of the clock the prototype gives it.
   */
  private drawLine(ctx: CanvasRenderingContext2D, from: Cell, to: Cell, time: number): void {
    const a = this.overheadPoint(from, LINE_LIFT);
    const b = this.overheadPoint(to, LINE_LIFT);
    if (a === null || b === null) return;

    const mx = (a.x + b.x) / 2;
    const my = Math.max(a.y, b.y) + 5;

    ctx.strokeStyle = 'rgba(200,200,210,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();

    for (let i = 1; i < 5; i += 1) {
      const f = i / 5;
      const rest = 1 - f;
      const x = rest * rest * a.x + 2 * rest * f * mx + f * f * b.x;
      const y = rest * rest * a.y + 2 * rest * f * my + f * f * b.y;
      const sway = Math.round(Math.sin(time * 1.4 + i));
      px(ctx, x - 2 + sway, y, 5, 6 + (i % 2) * 2, i % 2 ? '#d8cdb2' : '#9fa6bd');
    }
  }

  /**
   * The point a wire is tied to: the centre of a cell's top face, raised by `lift` of the prototype's
   * pixels and stated in the overlay's own. Null for a cell with no floor to tie a wire to.
   */
  private overheadPoint(cell: Cell, lift: number): Pixel | null {
    const level = this.terrain.levelAt(cell);
    if (level === NO_FLOOR) return null;

    const centre = cellToScreen(cell, level, this.terrain.lift);
    return { x: centre.x / PIXEL, y: centre.y / PIXEL - lift };
  }

  /**
   * One canvas of the map, painted once by `paint` and placed at its depth. `at` and `origin` are in
   * canvas pixels: the point of the canvas that lands on `at` is where the object is put, which is how
   * a cell's own drawing hangs off the centre of its top face.
   */
  private layer(
    key: string,
    width: number,
    height: number,
    depth: number,
    at: Pixel,
    origin: Pixel,
    paint: (ctx: CanvasRenderingContext2D) => void,
  ): Layer {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = context2d(canvas);
    paint(ctx);

    const texture = this.scene.textures.addCanvas(key, canvas);
    if (texture === null) throw new Error(`the texture manager refused the canvas ${key}`);

    const image = this.scene.add
      .image(at.x, at.y, key)
      .setOrigin(origin.x / width, origin.y / height)
      .setScale(PIXEL)
      .setDepth(depth);

    const layer = { canvas, ctx, texture, image };
    this.layers.push(layer);
    return layer;
  }
}
