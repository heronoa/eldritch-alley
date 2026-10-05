// The night behind the map: the sky, its stars, and the silhouette of the city under it.
//
// A port of `drawSky` and `skyline` of the prototype's `js/app.js`, in the prototype's own pixels. It
// is drawn once per map, on a canvas of its own, because nothing in it moves per cell; only the stars
// twinkle, and they take the same pass of the clock the cells do.
//
// The prototype paints this over its whole viewport, whatever size the window gives it, so the two
// numbers the drawing is stated in are the size of the canvas it is handed rather than a constant.
import { MAP_COLORS } from '../../maps/prototype-palette';
import type { PrototypeMapId } from '../../maps/prototype-maps';
import { px } from './cell';
import { rnd } from './random';

/** How the map reads the sky: the rooftop looks down on the city, the other two up at it. */
type Sky = PrototypeMapId;

/**
 * The benches of the city, farthest first: one silhouette at `baseY`, its buildings reaching down to
 * `bottom`. `litChance` is how many of its windows are lit, and the seed decides where they fall —
 * the same seed, the same skyline.
 */
function skyline(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseY: number,
  bottom: number,
  seed: number,
  color: string,
  litChance: number,
): void {
  const random = rnd(seed);
  let x = -5;

  while (x < width) {
    const buildingWidth = 10 + random() * 22;
    const buildingHeight = 18 + random() * 60;
    px(ctx, x, baseY - buildingHeight, buildingWidth, bottom - (baseY - buildingHeight), color);

    for (let wy = baseY - buildingHeight + 4; wy < baseY - 2; wy += 5) {
      for (let wx = x + 2; wx < x + buildingWidth - 2; wx += 4) {
        if (random() < litChance * 0.35) {
          ctx.globalAlpha = 0.55;
          px(ctx, wx, wy, 1, 2, MAP_COLORS.warm);
          ctx.globalAlpha = 1;
        }
      }
    }

    if (random() < 0.2) px(ctx, x + buildingWidth / 2, baseY - buildingHeight - 6, 1, 6, color);
    x += buildingWidth + random() * 4;
  }
}

/**
 * Paints the sky of `sky` over a canvas `width` by `height`, in the prototype's pixels.
 *
 * Both branches draw fifty to a hundred and sixty stars and then two skylines; the stars twinkle with
 * `time`, the skylines do not.
 */
export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  sky: Sky,
  width: number,
  height: number,
  time: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  if (sky === 'roof') {
    gradient.addColorStop(0, '#0a1230');
    gradient.addColorStop(0.6, '#121a3a');
    gradient.addColorStop(1, '#1a1c34');
  } else {
    gradient.addColorStop(0, '#0d1428');
    gradient.addColorStop(1, '#05070f');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const random = rnd(11);
  const stars = sky === 'roof' ? 160 : 50;
  for (let i = 0; i < stars; i += 1) {
    const sx = random() * width;
    const sy = random() * height * (sky === 'roof' ? 0.7 : 0.4);
    const twinkle = (Math.sin(time * 1.3 + i * 1.7) + 1) / 2;
    ctx.globalAlpha = 0.2 + twinkle * 0.6;
    px(ctx, sx, sy, 1, 1, i % 9 === 0 ? '#ffe9b0' : '#cfd6ff');
  }
  ctx.globalAlpha = 1;

  if (sky === 'roof') {
    // The moon: paper, with the night bitten out of it.
    const mx = width * 0.78;
    const my = height * 0.16;
    ctx.fillStyle = 'rgba(230,220,196,.08)';
    ctx.beginPath();
    ctx.arc(mx, my, 22, 0, 7);
    ctx.fill();
    ctx.fillStyle = MAP_COLORS.paper;
    ctx.beginPath();
    ctx.arc(mx, my, 9, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#121a3a';
    ctx.beginPath();
    ctx.arc(mx + 4, my - 2, 8, 0, 7);
    ctx.fill();

    // The city, far below.
    skyline(ctx, width, height * 0.9, height, 2, '#0c1024', 0.35);
    skyline(ctx, width, height * 0.97, height, 5, '#080b1a', 0.5);

    const cityGlow = ctx.createLinearGradient(0, height * 0.75, 0, height);
    cityGlow.addColorStop(0, 'transparent');
    cityGlow.addColorStop(1, 'rgba(240,217,160,.08)');
    ctx.fillStyle = cityGlow;
    ctx.fillRect(0, height * 0.75, width, height * 0.25);
  } else {
    skyline(ctx, width, height * 0.42, height * 0.42, 3, '#0f1529', 0.25);
    skyline(ctx, width, height * 0.5, height * 0.5, 7, '#0a0e1e', 0.35);

    const fog = ctx.createLinearGradient(0, height * 0.35, 0, height * 0.6);
    fog.addColorStop(0, 'transparent');
    fog.addColorStop(1, 'rgba(120,130,170,.05)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, height * 0.35, width, height * 0.25);
  }
}
