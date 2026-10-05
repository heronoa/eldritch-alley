// Title screen M2 — the city behind the title: the sky and its skyline, the isometric block, the
// props, the seven walkers and the effects of their ambient actions.
//
// This is the prototype's `render()` of
// `.ia_context/prototypes/eldritch-alley-title-screen/js/title-screen.js`, split into the drawing
// routines it was written as. What the city is made of comes from `city-data.ts`, where the walkers
// go from `walkers.ts`, when they stop from `ambient.ts`, the sprite frames from `sheet.ts`, and what
// is allowed to move from `motion.ts`. This is the only file of the title that touches a canvas.
import { idleFrame, walkFrame } from '../view/animation';
import {
  ambientEffect,
  ambientFade,
  ambientFrame,
  amuletBlinkOn,
  bottleAt,
  scopeGlintOn,
} from './ambient';
import { HEIGHT_ROWS, PROPS, TILE_ROWS, type Prop } from './city-data';
import type { MotionPolicy } from './motion';
import { CLASS_ROW, FRAME_HEIGHT, FRAME_WIDTH, frameOf, type SheetName, type Sheets } from './sheet';
import {
  WALKERS,
  createWalker,
  positionOf,
  stepWalker,
  type Walker,
  type WalkerKey,
} from './walkers';

/** The city is sixteen by sixteen cells. */
const CELLS = 16;

/** One cell of the isometric grid: twice as wide as it is tall, one level eight pixels high. */
const TILE_WIDTH = 32;
const TILE_HEIGHT = 16;
const LEVEL_HEIGHT = 8;

/** How solid the shadow under a walker is. */
const SHADOW_ALPHA = 0.35;

/** The origin of the map: the middle of the low-resolution canvas, offset by one cell's width. */
const ORIGIN_X_OFFSET = TILE_WIDTH;

/** How far down the canvas the middle of the map sits: the crossing ends up under the button. */
const ORIGIN_Y_FRACTION = 0.7;

/** How many stars the sky holds, and how fast they breathe. */
const STARS = 70;
const STAR_SPEED = 1.3;

/** The seeds of the two painted layers. Both come from the same generator as the cells. */
const STAR_SEED = 5;
const SKYLINE_SEED = 9;

/**
 * The three faces of a cell, in the order the prototype paints them: the left side, the right side
 * and the top. Asphalt and crosswalk share a colour, which is why the map has two letters for one
 * material.
 */
const FACE_COLOR: Record<string, readonly [string, string, string]> = {
  a: ['#23283a', '#171b28', '#11141f'],
  z: ['#23283a', '#171b28', '#11141f'],
  s: ['#343b51', '#22283a', '#1a1f2e'],
  g: ['#1f3029', '#16221d', '#111a16'],
  B: ['#1a1e2c', '#141826', '#0f121c'],
};

/** A building window that is not lit. */
const WINDOW_DARK = '#0b0e17';
const LANE_MARK = 'rgba(217,180,74,.55)';
const CROSSWALK_STRIPE = 'rgba(230,220,196,.35)';

/** The neon of the two leaks: the only neon on the title (art direction rule). */
const NEON_PINK = '#ff3df2';
const NEON_CYAN = '#3de9ff';

/** How fast the arcane in a leak pulses. */
const LEAK_PULSE_SPEED = 2.2;

/** The props of a cell, by `x,y`, built once: the drawing asks by position, as the prototype did. */
const PROPS_AT = new Map<string, Prop[]>();
for (const prop of PROPS) {
  const key = `${prop.x},${prop.y}`;
  const list = PROPS_AT.get(key);
  if (list === undefined) PROPS_AT.set(key, [prop]);
  else list.push(prop);
}

/** The city behind the title, and the loop that keeps it moving. */
export interface CityView {
  /** Starts the loop. Calling it twice is the same as calling it once. */
  start(): void;
  /** Stops the loop. The walkers keep the positions they had. */
  stop(): void;
  /** Follows a new motion policy without losing where the walkers are. */
  setPolicy(policy: MotionPolicy): void;
}

/**
 * Builds the title's city. The sheets must be loaded first: the walkers are frames of them.
 *
 * The city is drawn on a low-resolution canvas and scaled up with smoothing off, which is what makes
 * the blocks and the sprites read as pixel art at any window size.
 */
export function createCity(
  canvas: HTMLCanvasElement,
  sheets: Sheets,
  policy: MotionPolicy,
): CityView {
  const context = context2d(canvas);
  // The canvas the city is actually drawn on, at two to four pixels per cell of screen.
  const low = document.createElement('canvas');
  const g = context2d(low);

  let current = policy;
  let handle = 0;
  let running = false;
  let last = performance.now();

  // The top-left of the map on the low-resolution canvas, recomputed every frame from its size.
  let originX = 0;
  let originY = 0;

  // One walker per class of the roster, in the order `WALKERS` lists them.
  const walkers: Walker[] = (Object.keys(WALKERS) as WalkerKey[]).map((key) =>
    createWalker(key, Math.random),
  );

  /** Where a cell sits on the low-resolution canvas, `h` levels above the street. */
  function iso(x: number, y: number, h: number): { x: number; y: number } {
    return {
      x: originX + ((x - y) * TILE_WIDTH) / 2,
      y: originY + ((x + y) * TILE_HEIGHT) / 2 - h * LEVEL_HEIGHT,
    };
  }

  /** A filled shape: the three visible faces of a block are drawn with this. */
  function polygon(points: readonly (readonly [number, number])[], color: string): void {
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  /** One rectangle, snapped to whole pixels: a window or a lane mark is one pixel, or three. */
  function pixel(x: number, y: number, w: number, h: number, color: string): void {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  }

  /** A block of the isometric grid, from a centre, half-extents `a` and `b`, and a height. */
  function isoBox(
    cx: number,
    cy: number,
    a: number,
    b: number,
    h: number,
    top: string,
    left: string,
    right: string,
  ): void {
    const corner = (u: number, v: number, z: number): [number, number] => [
      cx + ((u - v) * TILE_WIDTH) / 2,
      cy + ((u + v) * TILE_HEIGHT) / 2 - z,
    ];
    polygon([corner(-a, b, 0), corner(a, b, 0), corner(a, b, h), corner(-a, b, h)], left);
    polygon([corner(a, -b, 0), corner(a, b, 0), corner(a, b, h), corner(a, -b, h)], right);
    polygon([corner(-a, -b, h), corner(a, -b, h), corner(a, b, h), corner(-a, b, h)], top);
  }

  /** The sky, its stars and the skyline behind the city. */
  function drawSky(width: number, height: number, time: number): void {
    const sky = g.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0d1428');
    sky.addColorStop(1, '#05070f');
    g.fillStyle = sky;
    g.fillRect(0, 0, width, height);

    const stars = random(STAR_SEED);
    for (let i = 0; i < STARS; i += 1) {
      g.globalAlpha = 0.2 + ((Math.sin(time * STAR_SPEED + i) + 1) / 2) * 0.5;
      pixel(stars() * width, stars() * height * 0.35, 1, 1, '#cfd6ff');
    }
    g.globalAlpha = 1;

    const skyline = random(SKYLINE_SEED);
    const ground = height * 0.32;
    for (let x = -4; x < width; ) {
      const buildingWidth = 8 + skyline() * 18;
      const buildingHeight = 20 + skyline() * 50;
      pixel(x, ground - buildingHeight, buildingWidth, buildingHeight + height, '#0a0e1e');

      for (let wy = ground - buildingHeight + 3; wy < ground; wy += 5) {
        for (let wx = x + 2; wx < x + buildingWidth - 2; wx += 4) {
          if (skyline() < 0.12) {
            g.globalAlpha = 0.5;
            pixel(wx, wy, 1, 2, '#f0d9a0');
            g.globalAlpha = 1;
          }
        }
      }
      x += buildingWidth + 2;
    }
  }

  /** One cell: its three faces, then whatever its material draws on top of them. */
  function drawCell(x: number, y: number, time: number): void {
    const tile = TILE_ROWS[y][x];
    const height = HEIGHT_ROWS[y][x];
    const { x: sx, y: sy } = iso(x, y, height);
    const colors = FACE_COLOR[tile] ?? FACE_COLOR.a;
    const depth = (height + 1) * LEVEL_HEIGHT;

    const north: [number, number] = [sx, sy];
    const east: [number, number] = [sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2];
    const south: [number, number] = [sx, sy + TILE_HEIGHT];
    const west: [number, number] = [sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2];

    polygon([west, south, [south[0], south[1] + depth], [west[0], west[1] + depth]], colors[1]);
    polygon([south, east, [east[0], east[1] + depth], [south[0], south[1] + depth]], colors[2]);
    polygon([north, east, south, west], colors[0]);

    const detail = random(x * 31 + y * 17 + 3);
    if (tile === 'B') {
      for (let row = 4; row < depth - 4; row += 6) {
        for (let k = 2; k < 14; k += 4) {
          const side = detail() < 0.26 ? 'rgba(240,217,160,.55)' : WINDOW_DARK;
          const front = detail() < 0.2 ? 'rgba(240,217,160,.45)' : WINDOW_DARK;
          pixel(west[0] + k, west[1] + k / 2 + row, 2, 3, side);
          pixel(south[0] + k, south[1] - k / 2 + row, 2, 3, front);
        }
      }
    } else if (tile === 'z') {
      const lean = x === 8 || x === 9 ? -1 : 1;
      for (let k = -8; k <= 8; k += 4) {
        pixel(sx + k - 1, sy + 7 + (k / 2) * lean, 2, 2, CROSSWALK_STRIPE);
      }
    } else if (tile === 'a') {
      if (y === 6 && x % 2 === 0) pixel(sx - 8, sy + 11, 6, 1, LANE_MARK);
      if (x === 8 && y % 2 === 0) pixel(sx + 3, sy + 11, 6, 1, LANE_MARK);
    } else if (tile === 'g') {
      // The three draws of the generator are the prototype's order: x, then y, then the colour.
      for (let k = 0; k < 5; k += 1) {
        pixel(sx - 9 + detail() * 18, sy + 3 + detail() * 10, 1, 1, detail() < 0.5 ? '#2a4236' : '#16241d');
      }
    }

    const cx = sx;
    const cy = sy + TILE_HEIGHT / 2;
    for (const prop of PROPS_AT.get(`${x},${y}`) ?? []) drawProp(prop, cx, cy, time);
  }

  /** One prop, standing on the centre of its cell. */
  function drawProp(prop: Prop, cx: number, cy: number, time: number): void {
    if (prop.kind === 'lamp') {
      const light = g.createRadialGradient(cx, cy, 0, cx, cy, 20);
      light.addColorStop(0, 'rgba(240,217,160,.22)');
      light.addColorStop(1, 'transparent');
      g.fillStyle = light;
      g.fillRect(cx - 20, cy - 12, 40, 26);
      pixel(cx, cy - 22, 1, 22, '#4a4f66');
      pixel(cx - 1, cy - 23, 4, 2, '#4a4f66');
      pixel(cx + 2, cy - 21, 2, 1, '#f0d9a0');
      return;
    }

    if (prop.kind === 'car') {
      const body = prop.color ?? '#3d4152';
      if (prop.vertical === true) {
        isoBox(cx, cy, 0.2, 0.42, 5, body, '#1d2030', '#161824');
        isoBox(cx, cy - 5, 0.17, 0.22, 4, '#141826', '#1d2030', '#161824');
      } else {
        isoBox(cx, cy, 0.42, 0.2, 5, body, '#1d2030', '#161824');
        isoBox(cx - 1, cy - 5, 0.22, 0.17, 4, '#141826', '#1d2030', '#161824');
      }
      return;
    }

    if (prop.kind === 'tree') {
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(cx, cy, 9, 4, 0, 0, 7);
      g.fill();
      pixel(cx - 1, cy - 10, 3, 10, '#2e2620');
      for (const [bx, by, radius] of [
        [0, -18, 9],
        [-6, -14, 6],
        [6, -14, 6],
        [0, -24, 6],
      ]) {
        g.fillStyle = '#17291f';
        g.beginPath();
        g.arc(cx + bx, cy + by, radius, 0, 7);
        g.fill();
        g.fillStyle = '#21392b';
        g.beginPath();
        g.arc(cx + bx - 1, cy + by - 1, radius * 0.6, 0, 7);
        g.fill();
      }
      return;
    }

    drawLeak(cx, cy, time);
  }

  /** A leak: the arcane coming through the street, the one thing on the title that glows. */
  function drawLeak(cx: number, cy: number, time: number): void {
    const pulse = 0.6 + Math.sin(time * LEAK_PULSE_SPEED) * 0.25;
    const light = g.createRadialGradient(cx, cy, 0, cx, cy, 18);
    light.addColorStop(0, `rgba(255,61,242,${0.35 * pulse})`);
    light.addColorStop(1, 'transparent');
    g.fillStyle = light;
    g.fillRect(cx - 18, cy - 14, 36, 28);

    for (let i = 0; i < 14; i += 1) {
      const phase = (time * (0.22 + (i % 5) * 0.05) + i * 0.137) % 1;
      g.globalAlpha = (1 - phase) * 0.9;
      pixel(
        cx + Math.sin(i * 2.3 + time * 1.7) * (3 + (i % 4) * 2),
        cy - phase * 34,
        1,
        1,
        i % 2 === 0 ? NEON_CYAN : NEON_PINK,
      );
    }
    g.globalAlpha = 1;
  }

  /** One walker: what it is doing under it, the sprite, and what it is doing over it. */
  function drawWalker(walker: Walker, time: number, timeMs: number): void {
    const { x, y } = positionOf(walker);
    const centre = iso(x, y, 0);
    const cx = centre.x;
    const fy = centre.y + TILE_HEIGHT / 2;

    drawEffectsUnder(walker, cx, fy, time);
    g.fillStyle = `rgba(0,0,0,${SHADOW_ALPHA})`;
    g.fillRect(cx - 5, fy - 1, 10, 3);
    drawSprite(walker, cx - 8, fy - 22, timeMs);
    drawEffectsOver(walker, cx, fy);
  }

  /** The frame of a walker right now, mirrored when it walks the other way. */
  function drawSprite(walker: Walker, x: number, y: number, timeMs: number): void {
    const pose = poseOf(walker, timeMs);
    const frame = frameOf(sheets, pose.sheet, pose.row, pose.column);

    g.save();
    if (walker.face === -1) {
      // The roster is drawn front view only, so the other side is the same frame mirrored.
      g.translate(x + FRAME_WIDTH, y);
      g.scale(-1, 1);
      g.drawImage(frame.image, frame.x, frame.y, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    } else {
      g.drawImage(frame.image, frame.x, frame.y, FRAME_WIDTH, FRAME_HEIGHT, x, y, FRAME_WIDTH, FRAME_HEIGHT);
    }
    g.restore();
  }

  /**
   * The sheet and the frame a walker shows now. Walking, the legs alternate; acting, the action's own
   * column decides, and a `null` from `ambientFrame` is the walker standing idle — which is what the
   * sniper does at both ends of a reload and the vendor before and after the throw.
   */
  function poseOf(walker: Walker, timeMs: number): { sheet: SheetName; row: number; column: number } {
    const now = timeMs / 1000;
    const blinking =
      (walker.key === 'sniper' && scopeGlintOn(now)) ||
      (walker.key === 'vendor' && amuletBlinkOn(now));

    const column =
      walker.state === 'walk'
        ? 1 + walkFrame(timeMs)
        : (ambientFrame(walker.ambient ?? 'idle', walker.timer) ?? idleFrame(timeMs) - 1);

    return { sheet: blinking ? 'blink' : 'neutral', row: CLASS_ROW[walker.key], column };
  }

  /** The effect an action lays on the ground under the walker: the two meditations, and nothing else. */
  function drawEffectsUnder(walker: Walker, cx: number, cy: number, time: number): void {
    if (walker.state !== 'act') return;
    const effect = ambientEffect(walker.ambient ?? 'idle');
    const k = ambientFade(walker.timer);
    if (k <= 0) return;

    if (effect === 'magic-circle') {
      g.save();
      g.globalAlpha = 0.9 * k;
      g.strokeStyle = NEON_PINK;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, 12, 6, 0, 0, 7);
      g.stroke();
      g.strokeStyle = NEON_CYAN;
      g.beginPath();
      g.ellipse(cx, cy, 8, 4, 0, 0, 7);
      g.stroke();
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + time / 0.6;
        const dot = i % 2 === 0 ? '#ffd0f8' : NEON_PINK;
        pixel(cx + Math.cos(angle) * 10, cy + Math.sin(angle) * 5, 1, 1, dot);
      }
      g.restore();
      return;
    }

    if (effect === 'light-beam') {
      g.save();
      const beam = g.createLinearGradient(0, 0, 0, cy);
      beam.addColorStop(0, 'rgba(61,233,255,0)');
      beam.addColorStop(1, `rgba(61,233,255,${0.32 * k})`);
      g.fillStyle = beam;
      g.fillRect(cx - 7, 0, 14, cy);
      g.globalAlpha = 0.45 * k;
      g.fillStyle = '#bff6ff';
      g.beginPath();
      g.ellipse(cx, cy, 10, 5, 0, 0, 7);
      g.fill();
      g.restore();
    }
  }

  /**
   * The effect that sits over the walker: the particles of the two meditations, the magazine the
   * sniper drops, and the bottle the vendor throws and then shatters.
   */
  function drawEffectsOver(walker: Walker, cx: number, cy: number): void {
    if (walker.state !== 'act') return;
    const effect = ambientEffect(walker.ambient ?? 'idle');
    const k = ambientFade(walker.timer);

    if (effect === 'magic-circle') {
      // Sparks rising off the circle, fading as they climb.
      g.save();
      for (let i = 0; i < 10; i += 1) {
        const phase = (walker.timer / 0.9 + i * 0.1) % 1;
        g.globalAlpha = (1 - phase) * k;
        pixel(cx - 8 + ((i * 7) % 16), cy - 4 - phase * 24, 1, 1, i % 2 === 0 ? NEON_PINK : NEON_CYAN);
      }
      g.restore();
      return;
    }

    if (effect === 'light-beam') {
      // Motes falling down the beam.
      g.save();
      for (let i = 0; i < 4; i += 1) {
        const phase = (walker.timer / 0.7 + i * 0.25) % 1;
        g.globalAlpha = (1 - phase) * k;
        pixel(cx - 5 + i * 3, cy - 30 + phase * 26, 1, 2, '#e8fdff');
      }
      g.restore();
      return;
    }

    if (effect === 'reload-magazine') {
      // The spent magazine, out of the weapon for half a second and falling.
      if (walker.timer > 0.3 && walker.timer < 0.8) {
        pixel(cx - 1, cy - 8 + (walker.timer - 0.3) * 14, 2, 2, '#3a3f55');
      }
      return;
    }

    if (effect === 'bottle') drawBottle(walker, cx, cy);
  }

  /**
   * The vendor's bottle: thrown in an arc, then a handful of shards where it lands. `bottleAt` says
   * whether there is a bottle and how far along it is; the flight is the first 0.6 s of that, the
   * shatter the 0.3 s after it.
   */
  function drawBottle(walker: Walker, cx: number, cy: number): void {
    const bottle = bottleAt(walker.timer);
    if (bottle === null) return;

    if (walker.timer < 1.1) {
      const p = bottle.t;
      pixel(cx + walker.face * p * 40, cy - 12 - Math.sin(p * Math.PI) * 22 + p * 10, 2, 2, '#3f8a5a');
      return;
    }

    const p = bottle.t;
    for (let i = 0; i < 6; i += 1) {
      pixel(
        cx + walker.face * 40 + Math.cos(i) * p * 8,
        cy - 2 + Math.sin(i * 1.7) * p * 5,
        1,
        1,
        i % 2 === 0 ? '#d8e8d0' : '#3f8a5a',
      );
    }
  }

  /** One frame: the walkers a step on, then everything drawn back to front. */
  function draw(timeMs: number): void {
    const dt = Math.min(0.05, (timeMs - last) / 1000);
    last = timeMs;
    const time = timeMs / 1000;

    if (current.walkers) {
      for (let i = 0; i < walkers.length; i += 1) {
        walkers[i] = stepWalker(walkers[i], current.speed * dt, Math.random);
      }
    }

    const ratio = window.devicePixelRatio || 1;
    const deviceWidth = canvas.clientWidth * ratio;
    const deviceHeight = canvas.clientHeight * ratio;
    if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
      canvas.width = deviceWidth;
      canvas.height = deviceHeight;
    }

    // The city is drawn at two to four pixels per cell of screen, then blown up whole.
    const scale = Math.max(2, Math.round(Math.min(deviceWidth / 520, deviceHeight / 300)));
    const width = Math.ceil(deviceWidth / scale);
    const height = Math.ceil(deviceHeight / scale);
    if (low.width !== width || low.height !== height) {
      low.width = width;
      low.height = height;
    }
    g.imageSmoothingEnabled = false;

    originX = Math.round(width / 2 - ORIGIN_X_OFFSET);
    originY = Math.round(height * ORIGIN_Y_FRACTION - (15 * TILE_HEIGHT) / 2 - 8);

    drawSky(width, height, time);

    // Cells first, then walkers: a walker stands between the cell it is on and the one behind it, so
    // a building it has walked past covers it and one it has not does not.
    const items: CityItem[] = [];
    for (let y = 0; y < CELLS; y += 1) {
      for (let x = 0; x < CELLS; x += 1) items.push({ kind: 'cell', depth: x + y, x, y });
    }
    for (const walker of walkers) {
      const { x, y } = positionOf(walker);
      items.push({ kind: 'walker', depth: Math.round(x) + Math.round(y) + 0.5, walker });
    }
    items.sort((a, b) => a.depth - b.depth || orderOf(a) - orderOf(b));

    for (const item of items) {
      if (item.kind === 'cell') drawCell(item.x, item.y, time);
      else drawWalker(item.walker, time, timeMs);
    }

    context.imageSmoothingEnabled = false;
    context.drawImage(low, 0, 0, width * scale, height * scale);
  }

  function tick(timeMs: number): void {
    if (!running) return;
    handle = requestAnimationFrame(tick);
    draw(timeMs);
  }

  function start(): void {
    if (running) return;
    running = true;
    // The tab may have been hidden for a while; the first frame after that is not a long one.
    last = performance.now();
    handle = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(handle);
  }

  // A hidden tab is a stopped loop: a title left open in the background costs nothing.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  return {
    start,
    stop,
    setPolicy(next: MotionPolicy): void {
      current = next;
    },
  };
}

/** The 2D context of a canvas, or an error: without it there is no city to draw. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const found = canvas.getContext('2d');
  if (found === null) throw new Error('the title needs a 2D canvas to draw the city on');
  return found;
}

/** Where an item goes among the others drawn at the same depth: a cell, then a walker on it. */
function orderOf(item: CityItem): number {
  return item.kind === 'cell' ? 0 : 1;
}

/** One thing drawn back to front: a cell of the map, or a walker standing on it. */
type CityItem =
  | { readonly kind: 'cell'; readonly depth: number; readonly x: number; readonly y: number }
  | { readonly kind: 'walker'; readonly depth: number; readonly walker: Walker };

/**
 * The prototype's own generator: a small linear congruential sequence, seeded, so the stars, the
 * skyline, the windows and the grass speckles are the same on every load and on every machine. The
 * arithmetic is kept as the prototype wrote it, the float remainder included.
 */
function random(seed: number): () => number {
  let state = (seed * 2654435761) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
