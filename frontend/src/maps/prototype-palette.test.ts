// Map fidelity M2 — the palette of the prototype's tiles, as `js/data.js` declares it.
//
// The three maps are drawn with the prototype's own colours, so the values a test holds are the
// prototype's, letter by letter. Two of its keys are declared twice (`k` and `v`), and a JS object
// literal keeps the last declaration: the values below are the second ones, which are the ones the
// prototype draws with.
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { luminance } from '../view/contrast';
import { PROTOTYPE_MAPS } from './prototype-maps';
import { MAP_COLORS, TILE_PALETTE, shadeHex } from './prototype-palette';

/** The `TILE` table of `data.js`, verbatim, with the duplicate keys already resolved. */
const PROTOTYPE_TILE: Record<string, { name: string; top: string; left: string; right: string }> = {
  a: { name: 'asfalto', top: '#23283a', left: '#171b28', right: '#11141f' },
  s: { name: 'calçada', top: '#343b51', left: '#22283a', right: '#1a1f2e' },
  x: { name: 'beco', top: '#3a3f52', left: '#262a38', right: '#1e212c' },
  d: { name: 'plataforma de carga', top: '#3b3a45', left: '#28272f', right: '#201f26' },
  g: { name: 'grama', top: '#1f3029', left: '#16221d', right: '#111a16' },
  p: { name: 'caminho', top: '#3a3a44', left: '#28282f', right: '#202026' },
  w: { name: 'lago', top: '#142446', left: '#0f1a33', right: '#0b1428' },
  q: { name: 'praça', top: '#3f4152', left: '#2b2d39', right: '#22242e' },
  r: { name: 'laje', top: '#30364a', left: '#212536', right: '#1a1d2b' },
  R: { name: 'cascalho do telhado', top: '#2a2d3a', left: '#1d1f29', right: '#171921' },
  B: { name: 'prédio (bloqueado)', top: '#1a1e2c', left: '#141826', right: '#0f121c' },
  z: { name: 'faixa de pedestres', top: '#23283a', left: '#171b28', right: '#11141f' },
  v: { name: 'vão entre prédios', top: '#05070e', left: '#05070e', right: '#05070e' },
  k: { name: 'telhado vizinho', top: '#2e3140', left: '#1f212c', right: '#191a23' },
  f: { name: 'estacionamento cercado (bloqueado)', top: '#171a26', left: '#11131c', right: '#0d0f16' },
  h: { name: 'casa de máquinas (bloqueado)', top: '#3a3f55', left: '#2a2e3f', right: '#222533' },
  b: { name: 'tábua sobre o vão', top: '#5a4a36', left: '#3e3325', right: '#33291d' },
};

/** Every letter the three maps actually use, which is the palette the player ever sees. */
const LETTERS_IN_USE: readonly string[] = [
  ...new Set(PROTOTYPE_MAPS.flatMap((map) => [...map.tiles.join('')])),
].sort();

/** The colours of `data.js`'s `C` that the drawing reads. */
const PROTOTYPE_DRAWING_COLORS = {
  outline: '#07080e',
  paper: '#e6dcc4',
  neon: ['#ff3df2', '#3de9ff'],
  warm: '#f0d9a0',
};

/** The gap is one flat diamond, not a block: the prototype paints its three faces the same colour. */
const FLAT_LETTERS: readonly string[] = ['v'];

/** The 24-bit number of a hex string, which is what the contrast helpers measure. */
function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** The palette as the player sees it: the name a tile shows, in the language of the client. */
function named(): Record<string, { name: string; top: string; left: string; right: string }> {
  return Object.fromEntries(
    Object.entries(TILE_PALETTE).map(([letter, tile]) => [letter, { ...tile, name: t(tile.name) }]),
  );
}

describe('TILE_PALETTE', () => {
  it('keeps every tile of the prototype, letter for letter', () => {
    // The names in the data are keys, so resolving them is what makes this a comparison with the
    // prototype's own table rather than with the client's vocabulary.
    expect(named()).toEqual(PROTOTYPE_TILE);
  });

  it('has an entry for every letter the three maps use', () => {
    expect(LETTERS_IN_USE.length).toBeGreaterThan(10);

    for (const letter of LETTERS_IN_USE) {
      expect(TILE_PALETTE[letter], letter).toBeDefined();
    }
  });

  it('gives every letter a lighter top and two darker faces', () => {
    // The light of the prototype comes from above, so the top face is the lightest of the three and
    // the block separates from the ground it stands on.
    for (const letter of LETTERS_IN_USE) {
      if (FLAT_LETTERS.includes(letter)) continue;

      const face = TILE_PALETTE[letter];
      expect(luminance(hex(face.left)), `${letter} left`).toBeLessThan(luminance(hex(face.top)));
      expect(luminance(hex(face.right)), `${letter} right`).toBeLessThan(luminance(hex(face.top)));
    }
  });

  it('paints a gap as one flat tone, with no lighter top', () => {
    // `v` is the hole between two buildings and it is drawn as a single diamond at street level, so
    // the rule above does not apply to it: its three faces are the same colour on purpose.
    for (const letter of FLAT_LETTERS) {
      const face = TILE_PALETTE[letter];

      expect(face.top).toBe(face.left);
      expect(face.top).toBe(face.right);
      expect(luminance(hex(face.top))).toBeLessThan(luminance(hex(TILE_PALETTE.a.top)));
    }
  });
});

describe('MAP_COLORS', () => {
  it('keeps the colours the prototype draws its outlines and lights with', () => {
    expect(MAP_COLORS).toEqual(PROTOTYPE_DRAWING_COLORS);
  });
});

describe('shadeHex', () => {
  it('darkens every channel by the factor, as the prototype does', () => {
    // `app.js` adds a fraction of each channel to itself and clamps: the car bodies are shaded with it.
    expect(shadeHex('#4a2830', -0.3)).toBe('rgb(51,28,33)');
    expect(shadeHex('#ffffff', -0.5)).toBe('rgb(127,127,127)');
  });

  it('leaves a colour alone at 0 and never goes below black', () => {
    expect(shadeHex('#4a2830', 0)).toBe('rgb(74,40,48)');
    expect(shadeHex('#4a2830', -1)).toBe('rgb(0,0,0)');
  });
});
