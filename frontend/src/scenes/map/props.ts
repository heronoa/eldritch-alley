// The props of a map: the lamps, cars, trees, boxes and warnings the prototype places on its cells.
// A port of `drawProp` of the prototype's `js/app.js`, in the prototype's own pixels, one drawer per
// type of prop.
//
// `data.js` declares four of its switch cases twice — `moto`, `dish`, `chalk` and `pole` — and a switch
// takes the first match, so the drawer that wins here is the first of the pair, as it is there. Only
// the types the three maps actually place have a drawer: a prop the maps never use, such as the
// prototype's `cones` or `kiosk`, is not ported, and `drawProp` refuses it by name rather than drawing
// nothing.
//
// Every drawer reads its own arguments and nothing else: the same prop at the same moment is the same
// picture twice running, which is what lets a cell be repainted without the map changing under it.
import type { Pixel } from '../../view/grid';
import type { PropSpec } from '../../maps/prototype-maps';
import { MAP_COLORS, shadeHex } from '../../maps/prototype-palette';
import { TH, TW, isoBox, line, poly, px } from './cell';

/** Draws one prop with its centre at a point of the canvas. */
export type PropDrawer = (
  ctx: CanvasRenderingContext2D,
  prop: PropSpec,
  at: Pixel,
  time: number,
) => void;

/** The colours `TILE` is drawn with, under the names `data.js` gives them. */
const WARM = MAP_COLORS.warm;
const PAPER = MAP_COLORS.paper;
const NEON = MAP_COLORS.neon;

/** A filled ellipse, as the prototype draws them. */
function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, 0, 7);
  ctx.fill();
}

/** A circle: the prototype's `arc(…, 0, 7)`. */
function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 7);
  ctx.fill();
}

/** A radial glow of one colour, faded to nothing at `radius`. */
function glow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
): CanvasGradient {
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  return gradient;
}

const lamp: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  const flicker = 0.8 + Math.sin(time * 3 + cx) * 0.05;

  ctx.fillStyle = glow(ctx, cx, cy, 20, `rgba(240,217,160,${0.22 * flicker})`);
  ctx.fillRect(cx - 20, cy - 12, 40, 26);
  px(ctx, cx, cy - 22, 1, 22, '#4a4f66');
  px(ctx, cx - 1, cy - 23, 4, 2, '#4a4f66');
  px(ctx, cx + 2, cy - 21, 2, 1, WARM);
};

const car: PropDrawer = (ctx, prop, at) => {
  const { x: cx, y: cy } = at;
  // Every car of the three maps carries its own colour; the fallback is the tone of the dark cars.
  const body = prop.c ?? '#3d4152';

  isoBox(ctx, cx, cy, 0.42, 0.2, 5, body, shadeHex(body, -0.3), shadeHex(body, -0.45));
  isoBox(ctx, cx - 1, cy - 5, 0.22, 0.17, 4, '#141826', shadeHex(body, -0.2), shadeHex(body, -0.35));
  px(ctx, cx + 9, cy + 2, 2, 1, 'rgba(240,217,160,.8)');
};

const dumpster: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy, 0.3, 0.22, 7, '#2a3a31', '#1d2922', '#16201a');
  px(ctx, cx - 6, cy - 7, 12, 1, '#3b4f43');
};

const bags: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx - 6, cy - 3, 4, 3, '#14161f');
  px(ctx, cx - 2, cy - 4, 4, 4, '#1c1f2b');
  px(ctx, cx + 2, cy - 2, 3, 2, '#14161f');
};

const crates: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx - 3, cy + 1, 0.16, 0.16, 5, '#5a4a36', '#3e3325', '#33291d');
  isoBox(ctx, cx + 4, cy - 1, 0.14, 0.14, 4, '#5a4a36', '#3e3325', '#33291d');
  isoBox(ctx, cx - 1, cy - 5, 0.12, 0.12, 4, '#6a583f', '#46392a', '#3a2f22');
};

const flyers: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  ['#d8cdb2', '#c9bea3', '#d8cdb2'].forEach((color, i) => {
    px(ctx, cx - 6 + i * 4, cy - 1 + (i % 2) * 2, 3, 2, color);
  });
};

const puddle: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  ctx.fillStyle = 'rgba(70,90,150,.35)';
  ellipse(ctx, cx, cy, 7, 3);
  ctx.globalAlpha = 0.4 + Math.sin(time * 2 + cx) * 0.15;
  px(ctx, cx - 2, cy - 1, 3, 1, NEON[1]);
  ctx.globalAlpha = 1;
};

const manhole: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  ctx.fillStyle = '#121520';
  ellipse(ctx, cx, cy, 5, 2.5);

  for (let i = 0; i < 8; i += 1) {
    const phase = (time * 0.3 + i * 0.125) % 1;
    ctx.globalAlpha = (1 - phase) * 0.35;
    px(ctx, cx + Math.sin(i * 3 + time) * 3, cy - phase * 26, 2, 2, '#c9cbd8');
  }
  ctx.globalAlpha = 1;
};

const hydrant: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx - 1, cy - 6, 3, 6, '#8a2a24');
  px(ctx, cx - 2, cy - 4, 5, 1, '#8a2a24');
  px(ctx, cx - 1, cy - 7, 3, 1, '#a8352d');
};

const tree: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ellipse(ctx, cx, cy, 9, 4);
  px(ctx, cx - 1, cy - 10, 3, 10, '#2e2620');

  const blobs: [number, number, number][] = [
    [0, -18, 9],
    [-6, -14, 6],
    [6, -14, 6],
    [0, -24, 6],
  ];
  for (const [bx, by, br] of blobs) {
    ctx.fillStyle = '#17291f';
    circle(ctx, cx + bx, cy + by, br);
  }
  for (const [bx, by, br] of blobs) {
    ctx.fillStyle = '#21392b';
    circle(ctx, cx + bx - 1, cy + by - 1, br * 0.6);
  }
};

const bush: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  ctx.fillStyle = '#17291f';
  ctx.beginPath();
  ctx.arc(cx - 3, cy - 3, 4, 0, 7);
  ctx.arc(cx + 3, cy - 3, 4, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#21392b';
  circle(ctx, cx - 1, cy - 5, 3);
};

const bench: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy - 2, 0.3, 0.07, 1, '#5a4a36', '#3e3325', '#33291d');
  px(ctx, cx - 6, cy - 2, 1, 3, '#2a2a33');
  px(ctx, cx + 5, cy - 1, 1, 3, '#2a2a33');
};

const fountain: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy + 1, 0.4, 0.4, 3, '#2b4a7a', '#4a4c5c', '#3a3c4a');

  for (let i = 0; i < 12; i += 1) {
    const phase = (time * 0.9 + i / 12) % 1;
    const angle = i * 0.52;
    ctx.globalAlpha = (1 - phase) * 0.7;
    px(ctx, cx + Math.cos(angle) * phase * 7, cy - 3 - Math.sin(phase * 3.14) * 12, 1, 1, '#bcd2ff');
  }
  ctx.globalAlpha = 1;
  px(ctx, cx, cy - 12, 1, 9, '#bcd2ff');
};

const tower: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx - 6, cy - 8, 1, 8, '#3a3f55');
  px(ctx, cx + 5, cy - 8, 1, 8, '#3a3f55');
  px(ctx, cx, cy - 6, 1, 6, '#3a3f55');
  isoBox(ctx, cx, cy - 8, 0.26, 0.26, 12, '#4a3a2c', '#3a2d22', '#2e241b');
  poly(
    ctx,
    [
      [cx - 8, cy - 22],
      [cx, cy - 30],
      [cx + 8, cy - 22],
      [cx, cy - 18],
    ],
    '#2a2d3a',
  );
};

const ac: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy, 0.2, 0.2, 5, '#5c6175', '#44485a', '#373a49');
  px(ctx, cx - 3, cy - 4, 6, 1, '#2a2d3a');
  px(ctx, cx - 3, cy - 2, 6, 1, '#2a2d3a');
};

const skylight: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy, 0.35, 0.3, 2, 'rgba(110,150,220,.35)', '#3a3f55', '#2e3244');
};

const vent: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy, 0.1, 0.1, 7, '#5c6175', '#44485a', '#373a49');
  px(ctx, cx - 2, cy - 9, 5, 1, '#6c7186');
};

const antenna: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx, cy - 34, 1, 34, '#5c6175');
  px(ctx, cx - 4, cy - 28, 9, 1, '#5c6175');
  px(ctx, cx - 3, cy - 20, 7, 1, '#5c6175');
  if (Math.sin(time * 2.5) > 0) px(ctx, cx, cy - 36, 1, 2, '#ff4a3d');
};

const leak: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  const pulse = 0.6 + Math.sin(time * 2.2) * 0.25;

  ctx.fillStyle = glow(ctx, cx, cy, 18, `rgba(255,61,242,${0.35 * pulse})`);
  ctx.fillRect(cx - 18, cy - 14, 36, 28);

  ctx.strokeStyle = NEON[0];
  ctx.globalAlpha = pulse;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 8, 4, 0, 0, 7);
  ctx.stroke();
  line(ctx, [cx - 6, cy], [cx + 6, cy], NEON[0]);
  line(ctx, [cx, cy - 3], [cx, cy + 3], NEON[0]);

  ctx.globalAlpha = 1;
  for (let i = 0; i < 16; i += 1) {
    const phase = (time * (0.22 + (i % 5) * 0.05) + i * 0.137) % 1;
    ctx.globalAlpha = (1 - phase) * 0.9;
    px(ctx, cx + Math.sin(i * 2.3 + time * 1.7) * (3 + (i % 4) * 2), cy - phase * 36, 1, 1, NEON[i % 2]);
  }
  ctx.globalAlpha = 1;
};

const pole: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx, cy - 34, 2, 34, '#3e352c');
  px(ctx, cx - 6, cy - 31, 14, 1, '#3e352c');
  px(ctx, cx - 5, cy - 33, 1, 2, '#5c6175');
  px(ctx, cx + 6, cy - 33, 1, 2, '#5c6175');
  isoBox(ctx, cx + 3, cy - 24, 0.08, 0.08, 5, '#4a4f66', '#3a3f55', '#2e3244');
};

const moto: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy, 0.25, 0.06, 3, '#2a2e3f', '#1d2030', '#171a27');
  px(ctx, cx - 5, cy - 1, 3, 3, '#0b0d14');
  px(ctx, cx + 3, cy + 2, 3, 3, '#0b0d14');
  px(ctx, cx + 4, cy - 5, 1, 3, '#5c6175');
};

const traffic: PropDrawer = (ctx, _prop, at, time) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx, cy - 26, 1, 26, '#4a4f66');
  px(ctx, cx - 2, cy - 30, 5, 9, '#1a1d29');

  const red = Math.floor(time / 3) % 2 === 0;
  px(ctx, cx - 1, cy - 29, 3, 2, red ? '#ff4a3d' : '#3a1a18');
  px(ctx, cx - 1, cy - 25, 3, 2, red ? '#183a22' : '#3dff8a');
};

const trash: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  isoBox(ctx, cx, cy, 0.1, 0.1, 6, '#3d4152', '#2d303d', '#252833');
  px(ctx, cx - 2, cy - 7, 5, 1, '#5c6175');
};

const dish: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx, cy - 6, 1, 6, '#5c6175');
  ctx.fillStyle = '#8a8fa3';
  ellipse(ctx, cx - 1, cy - 9, 5, 3, -0.6);
  ctx.fillStyle = '#5c6175';
  ellipse(ctx, cx - 1, cy - 9, 3, 1.5, -0.6);
};

const solar: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  px(ctx, cx - 6, cy - 2, 1, 3, '#5c6175');
  px(ctx, cx + 6, cy - 5, 1, 4, '#5c6175');
  poly(
    ctx,
    [
      [cx - 9, cy - 3],
      [cx + 3, cy - 9],
      [cx + 9, cy - 6],
      [cx - 3, cy],
    ],
    '#1d2a4a',
  );

  ctx.strokeStyle = 'rgba(140,170,220,.35)';
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 4.5);
  ctx.lineTo(cx + 6, cy - 7.5);
  ctx.moveTo(cx - 3, cy - 6);
  ctx.lineTo(cx, cy - 1);
  ctx.stroke();
};

const chalk: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  ctx.strokeStyle = 'rgba(230,220,196,.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13, 6.5, 0, 0, 7);
  ctx.stroke();

  for (let k = 0; k < 6; k += 1) {
    const angle = k * 1.047;
    px(ctx, cx + Math.cos(angle) * 13, cy + Math.sin(angle) * 6.5, 1, 1, PAPER);
  }
};

const tape: PropDrawer = (ctx, _prop, at) => {
  const { x: cx, y: cy } = at;
  const corners: [number, number][] = [
    [cx, cy - TH / 2],
    [cx + TW / 2, cy],
    [cx, cy + TH / 2],
    [cx - TW / 2, cy],
  ];

  for (let i = 0; i < 4; i += 1) {
    const [a, b] = [corners[i], corners[(i + 1) % 4]];
    for (let k = 0; k < 8; k += 1) {
      const f = k / 8;
      px(ctx, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f - 3, 2, 1, k % 2 ? PAPER : '#c8322a');
    }
  }
};

/** The drawer of every prop type the three maps place. */
export const PROP_DRAWERS: Readonly<Record<string, PropDrawer>> = {
  ac,
  antenna,
  bags,
  bench,
  bush,
  car,
  chalk,
  crates,
  dish,
  dumpster,
  flyers,
  fountain,
  hydrant,
  lamp,
  leak,
  manhole,
  moto,
  pole,
  puddle,
  skylight,
  solar,
  tape,
  tower,
  traffic,
  trash,
  tree,
  vent,
};

/**
 * The props that are repainted every frame, because their drawing reads the time: a lamp's light, a
 * leak's sparks, the traffic light. They are drawn on a canvas of their own, over the cell's.
 */
export const ANIMATED_PROPS: ReadonlySet<string> = new Set([
  'antenna',
  'fountain',
  'lamp',
  'leak',
  'manhole',
  'puddle',
  'traffic',
]);

/** Draws one prop. A type with no drawer is a bug in the maps, so it is refused by name. */
export function drawProp(
  ctx: CanvasRenderingContext2D,
  prop: PropSpec,
  at: Pixel,
  time: number,
): void {
  const drawer = PROP_DRAWERS[prop.t];
  if (drawer === undefined) throw new Error(`no drawer for prop ${prop.t}`);

  drawer(ctx, prop, at, time);
}

/** Whether a prop moves from frame to frame. */
export function isAnimatedProp(type: string): boolean {
  return ANIMATED_PROPS.has(type);
}

/**
 * The props that lie on the floor of a cell: `data.js` draws these before the ones standing on it,
 * whichever order it lists them in, and in this order among themselves.
 */
const FLOOR_PROPS: readonly string[] = ['puddle', 'manhole', 'flyers', 'chalk', 'leak', 'tape'];

/**
 * A cell's props in the order the prototype draws them: the ones on the floor first, each after the
 * other in `FLOOR_PROPS`, then the rest as `data.js` lists them. `sort` leaves items of equal rank
 * where they were, which is what keeps the standing props in their own order.
 */
export function propsInPaintOrder(props: readonly PropSpec[]): PropSpec[] {
  const rank = (prop: PropSpec) => {
    const index = FLOOR_PROPS.indexOf(prop.t);
    return index === -1 ? FLOOR_PROPS.length : index;
  };

  return [...props].sort((a, b) => rank(a) - rank(b));
}
