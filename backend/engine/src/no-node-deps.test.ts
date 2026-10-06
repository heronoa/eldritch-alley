// The engine is imported by the browser client (EA-1 D1), so nothing it ships may reach outside itself:
// a bare specifier drags a package into the bundle, and `node:` does not resolve in a browser at all.
// Test files are out of the scan: they run on Node and import vitest on purpose.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Every module specifier a file imports or re-exports, its own modules included. */
export function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g)) {
    found.push(match[1] ?? match[2]);
  }
  return found;
}

/** The modules the package ships, which are the ones a browser has to be able to load. */
function shippedFiles(): string[] {
  return readdirSync(SRC_DIR).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
}

describe('the engine ships no dependency', () => {
  it('reads the specifier out of every import shape', () => {
    expect(specifiers("import { a } from './a';")).toEqual(['./a']);
    expect(specifiers("import type { B } from '../b';")).toEqual(['../b']);
    expect(specifiers("export * from './c';")).toEqual(['./c']);
    expect(specifiers("import 'node:fs';")).toEqual(['node:fs']);
  });

  it('finds at least one import, so an empty scan is not read as a pass', () => {
    const all = shippedFiles().flatMap((file) => specifiers(readFileSync(join(SRC_DIR, file), 'utf8')));
    expect(all.length).toBeGreaterThan(0);
  });

  it('imports nothing but its own modules', () => {
    const offenders = shippedFiles().flatMap((file) =>
      specifiers(readFileSync(join(SRC_DIR, file), 'utf8'))
        .filter((specifier) => !specifier.startsWith('.'))
        .map((specifier) => `${file}: ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });
});
