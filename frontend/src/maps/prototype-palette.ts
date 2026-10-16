// Map fidelity M2 — the palette of the prototype's tiles, copied from `js/data.js`.
//
// The three maps are drawn with the prototype's own colours, so the board of the game and the board of
// the prototype are the same picture rather than two interpretations of one. The values are hex
// strings because that is what a canvas `fillStyle` takes: no conversion, and no number that could be
// rounded.
//
// `data.js` declares two keys twice — `k` (the plank over the gap, then the neighbour roof) and `v`
// (the gap, then the gap again) — and a JS object literal keeps the last declaration, so the table
// below is the one the prototype actually draws with.
//
// A tile's name is a message key, not text: the name the prototype gives a tile is read by a player,
// and the catalog holds it. Nothing draws the names yet.
import type { MessageKey } from '../i18n';

/** One tile of the prototype: the message key of its name, and its three faces. */
export interface TileFace {
  readonly name: MessageKey;
  readonly top: string;
  readonly left: string;
  readonly right: string;
}

/** The `TILE` table of `data.js`, with its duplicate keys resolved the way a literal resolves them. */
export const TILE_PALETTE: Readonly<Record<string, TileFace>> = {
  a: { name: 'terrain.a', top: '#23283a', left: '#171b28', right: '#11141f' },
  s: { name: 'terrain.s', top: '#343b51', left: '#22283a', right: '#1a1f2e' },
  x: { name: 'terrain.x', top: '#3a3f52', left: '#262a38', right: '#1e212c' },
  d: { name: 'terrain.d', top: '#3b3a45', left: '#28272f', right: '#201f26' },
  g: { name: 'terrain.g', top: '#1f3029', left: '#16221d', right: '#111a16' },
  p: { name: 'terrain.p', top: '#3a3a44', left: '#28282f', right: '#202026' },
  w: { name: 'terrain.w', top: '#142446', left: '#0f1a33', right: '#0b1428' },
  q: { name: 'terrain.q', top: '#3f4152', left: '#2b2d39', right: '#22242e' },
  r: { name: 'terrain.r', top: '#30364a', left: '#212536', right: '#1a1d2b' },
  R: { name: 'terrain.R', top: '#2a2d3a', left: '#1d1f29', right: '#171921' },
  B: { name: 'terrain.B', top: '#1a1e2c', left: '#141826', right: '#0f121c' },
  z: { name: 'terrain.z', top: '#23283a', left: '#171b28', right: '#11141f' },
  f: { name: 'terrain.f', top: '#171a26', left: '#11131c', right: '#0d0f16' },
  h: { name: 'terrain.h', top: '#3a3f55', left: '#2a2e3f', right: '#222533' },
  b: { name: 'terrain.b', top: '#5a4a36', left: '#3e3325', right: '#33291d' },
  // The last `k` of `data.js`: the neighbour's roof, not the plank.
  k: { name: 'terrain.k', top: '#2e3140', left: '#1f212c', right: '#191a23' },
  // The last `v`: the gap between the buildings, drawn as one flat diamond.
  v: { name: 'terrain.v', top: '#05070e', left: '#05070e', right: '#05070e' },
};

/** The colours of `data.js`'s `C` that the map drawing reads. */
export const MAP_COLORS = {
  outline: '#07080e',
  paper: '#e6dcc4',
  neon: ['#ff3df2', '#3de9ff'],
  warm: '#f0d9a0',
} as const;

/**
 * The prototype's `shade(hex, f)`: a fraction of each channel added to itself, clamped to the byte,
 * truncated the way `| 0` truncates. Used for the faces of the boxes it draws — a car's body, a
 * crate's side — where the three faces of a tile come from the palette instead.
 */
export function shadeHex(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (value: number) => Math.max(0, Math.min(255, value + value * factor)) | 0;

  return `rgb(${channel(n >> 16)},${channel((n >> 8) & 0xff)},${channel(n & 0xff)})`;
}
