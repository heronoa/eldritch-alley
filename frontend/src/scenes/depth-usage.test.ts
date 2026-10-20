import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LAYER } from '../view/depth';
import type { Cell } from '../view/grid';

// DT-47 — a static guard over the scene sources, in the spirit of `engine/forbidden.test.ts`. It cannot
// prove that a variable holds the right layer; it stops the two mistakes that are easy to make by hand:
// a number typed into `setDepth`, and a depth constant declared again outside the table.

const SCENES_DIR = dirname(fileURLToPath(import.meta.url));

/** Every non-test source under `scenes/`, with its path relative to the scenes folder. */
function sceneSources(dir = SCENES_DIR): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sceneSources(full);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [{ path: relative(SCENES_DIR, full), text: readFileSync(full, 'utf8') }];
  });
}

const SOURCES = sceneSources();

function sourceOf(path: string): string {
  const found = SOURCES.find((source) => source.path === path);
  if (found === undefined) throw new Error(`scenes/${path} does not exist`);
  return found.text;
}

describe('the depth of the scenes', () => {
  it('finds the scene sources it is meant to guard', () => {
    expect(SOURCES.map((source) => source.path)).toEqual(
      expect.arrayContaining(['MatchScene.ts', 'HudScene.ts', 'effects.ts', 'map/MapView.ts']),
    );
  });

  it('passes no numeric literal to setDepth', () => {
    for (const { path, text } of SOURCES) {
      expect(text, path).not.toMatch(/setDepth\(\s*-?\d/);
    }
  });

  it('never sets a depth on the HUD scene, which is drawn above by its place in the scene list', () => {
    expect(sourceOf('HudScene.ts')).not.toMatch(/setDepth\(/);
  });

  it('takes the layers of the match from the table, in the scenes that draw them', () => {
    for (const path of ['MatchScene.ts', 'effects.ts', 'map/MapView.ts']) {
      expect(sourceOf(path), path).toMatch(/from '(\.\.\/)+view\/depth'/);
    }
  });

  // Only names with DEPTH in them: a zoom step is not a depth, and `WHEEL_ZOOM_STEP` is fine where it is.
  it('declares no depth constant of its own outside the table', () => {
    for (const { path, text } of SOURCES) {
      expect(text, path).not.toMatch(/const\s+\w*DEPTH\w*\s*=/);
    }
  });
});

// ADR 0023 §3, §4: the camouflage silhouette is drawn behind its figure, and the mud over the marks
// of the board but under every unit, so the figure standing in it is never covered by it.
describe('the depth of the second active set', () => {
  const CELLS: Cell[] = [
    { x: 0, y: 0 },
    { x: 4, y: 5 },
    { x: 9, y: 9 },
  ];

  it('draws the mud above the marks of its cell and below the unit that stands on it', () => {
    for (const cell of CELLS) {
      expect(LAYER.mud(cell), `${cell.x},${cell.y}`).toBeGreaterThan(LAYER.highlight(cell));
      expect(LAYER.mud(cell), `${cell.x},${cell.y}`).toBeLessThan(LAYER.unit(cell));
    }
  });

  it('takes the mud layer of the map from the table', () => {
    expect(sourceOf('map/MapView.ts')).toMatch(/LAYER\.mud/);
  });

  it('draws the camouflage silhouette behind the figure it copies', () => {
    const text = sourceOf('units.ts');
    const start = text.indexOf('this.add([');
    expect(start).toBeGreaterThanOrEqual(0);

    const end = text.indexOf(']);', start);
    expect(end).toBeGreaterThan(start);

    // Phaser draws a container in insertion order: earlier in this array is lower on the screen.
    const children = text.slice(start, end);
    const glow = children.indexOf('this.glow');
    const figure = children.indexOf('this.figure');
    expect(glow).toBeGreaterThanOrEqual(0);
    expect(figure).toBeGreaterThanOrEqual(0);
    expect(glow).toBeLessThan(figure);
  });

  it('takes the colours of both marks from the theme, not from a literal of its own', () => {
    expect(sourceOf('units.ts')).toMatch(/CAMOUFLAGE_GLOW_COLOR/);
    expect(sourceOf('map/MapView.ts')).toMatch(/MUD_COLOR/);
  });
});
