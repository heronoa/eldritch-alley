import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

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
