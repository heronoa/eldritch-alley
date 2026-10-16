import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Modules that must exist and be guarded. */
const GUARDED_MODULES = [
  'abilities.ts',
  'actions.ts',
  'board.ts',
  'cover.ts',
  'events.ts',
  'facing.ts',
  'hash.ts',
  'height.ts',
  'index.ts',
  'initiative.ts',
  'match.ts',
  'rng.ts',
  'types.ts',
];

/**
 * Replaces comments and, optionally, string literals with blanks, so a pattern only matches real code.
 * A single pass, because a `//` inside a string is not a comment and a quote inside a comment is not a string.
 */
function scan(source: string, keepStrings: boolean): string {
  let out = '';
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '/' && next === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const start = i;
      i++;
      while (i < source.length && source[i] !== char) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      out += keepStrings ? source.slice(start, i) : '""';
      continue;
    }

    out += char;
    i++;
  }

  return out;
}

/** Ambient inputs that must never reach the engine. */
const FORBIDDEN_GLOBALS = [
  { name: 'Math.random', pattern: /Math\s*\.\s*random/ },
  { name: 'Date', pattern: /\bDate\b/ },
  { name: 'process', pattern: /\bprocess\b/ },
  { name: 'require(', pattern: /\brequire\s*\(/ },
  { name: 'setTimeout', pattern: /\bsetTimeout\b/ },
];

/** A module specifier that pulls in a Node built-in, checked on a view that keeps string literals. */
const NODE_SPECIFIER = /["'`]node:/;

/**
 * Any `/` left once comments and string literals are blanked is an operator, and integer math only
 * means no floating-point division. The engine has no regular-expression literals.
 */
const FORBIDDEN_DIVISION = /\//;

export function findViolations(source: string): string[] {
  const code = scan(source, false);
  const violations = FORBIDDEN_GLOBALS.filter(({ pattern }) => pattern.test(code)).map(
    ({ name }) => name,
  );
  if (NODE_SPECIFIER.test(scan(source, true))) violations.push('node:');
  if (FORBIDDEN_DIVISION.test(code)) violations.push('floating-point division');
  return violations;
}

function guardedFiles(): string[] {
  return readdirSync(SRC_DIR).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
}

describe('forbidden patterns', () => {
  it('detects each forbidden construct', () => {
    expect(findViolations('const roll = Math.random();')).toContain('Math.random');
    expect(findViolations('const now = Date.now();')).toContain('Date');
    expect(findViolations('const env = process.env;')).toContain('process');
    expect(findViolations("const mod = require('./mod');")).toContain('require(');
    expect(findViolations("import { readFileSync } from 'node:fs';")).toContain('node:');
    expect(findViolations('setTimeout(callback, 10);')).toContain('setTimeout');
    expect(findViolations('const half = total / 2;')).toContain('floating-point division');
  });

  it('ignores mentions inside comments and string literals', () => {
    expect(findViolations('// Math.random and Date are forbidden\nconst a = 1;')).toEqual([]);
    expect(findViolations('/* process, setTimeout, require( */\nconst a = 1;')).toEqual([]);
    expect(findViolations("const label = 'Math.random';")).toEqual([]);
  });

  it('accepts integer arithmetic', () => {
    expect(findViolations('const a = (b * 2 + 1) % 7; const c = b >>> 3; const d = b ^ c;')).toEqual(
      [],
    );
  });

  it('guards every engine module', () => {
    const files = guardedFiles();
    expect(files).toEqual(expect.arrayContaining(GUARDED_MODULES));
  });

  it('finds no forbidden construct in the engine sources', () => {
    const violations = guardedFiles().flatMap((file) =>
      findViolations(readFileSync(join(SRC_DIR, file), 'utf8')).map((name) => `${file}: ${name}`),
    );
    expect(violations).toEqual([]);
  });
});
