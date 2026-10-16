// EA-17: the battle report at the end of a match. Pure module — no DOM, no Phaser — so the shape of
// the exported file and the arithmetic of the scroll are tested without a browser; the one piece of
// I/O (handing the browser a file to save) stays out of this module and is tested at the scene seam.
import { describe, expect, it } from 'vitest';
import { clampScroll, exportFileName, exportText, visibleLines, type BattleReportHeader } from './battle-report';

const HEADER: BattleReportHeader = {
  result: 'Vitória',
  endedAt: new Date('2026-10-13T15:04:05.000Z'),
};

describe('exportText', () => {
  it('puts the result and the date before every line, one per line, in order', () => {
    const text = exportText(HEADER, ['A acertou B', 'B errou A']);

    const lines = text.split('\n');
    expect(lines[0]).toBe('Vitória');
    expect(lines).toContain('A acertou B');
    expect(lines).toContain('B errou A');
    expect(lines.indexOf('A acertou B')).toBeLessThan(lines.indexOf('B errou A'));
  });

  it('keeps an empty match report readable: the header, and nothing else to list', () => {
    const text = exportText(HEADER, []);
    expect(text.startsWith('Vitória')).toBe(true);
  });
});

describe('exportFileName', () => {
  it('is deterministic for a fixed date', () => {
    expect(exportFileName(HEADER.endedAt)).toBe(exportFileName(HEADER.endedAt));
  });

  it('ends in .txt and carries no character a filesystem would reject', () => {
    const name = exportFileName(HEADER.endedAt);
    expect(name.endsWith('.txt')).toBe(true);
    expect(name).toMatch(/^[a-zA-Z0-9._-]+$/);
  });

  it('two different moments never collide down to the second', () => {
    const a = exportFileName(new Date('2026-10-13T15:04:05.000Z'));
    const b = exportFileName(new Date('2026-10-13T15:04:06.000Z'));
    expect(a).not.toBe(b);
  });
});

describe('clampScroll', () => {
  it('never goes negative', () => {
    expect(clampScroll(-5, 40, 14)).toBe(0);
  });

  it('never exceeds total - visible', () => {
    expect(clampScroll(1000, 40, 14)).toBe(26);
  });

  it('clamps to 0 when the report is shorter than the panel', () => {
    expect(clampScroll(5, 10, 14)).toBe(0);
  });

  it('leaves an offset inside the range untouched', () => {
    expect(clampScroll(10, 40, 14)).toBe(10);
  });
});

describe('visibleLines', () => {
  const LINES = Array.from({ length: 20 }, (_, index) => `line ${index}`);

  it('returns exactly `visible` lines starting at the offset', () => {
    expect(visibleLines(LINES, 0, 5)).toEqual(['line 0', 'line 1', 'line 2', 'line 3', 'line 4']);
    expect(visibleLines(LINES, 5, 5)).toEqual(['line 5', 'line 6', 'line 7', 'line 8', 'line 9']);
  });

  it('returns fewer lines only at the very end', () => {
    expect(visibleLines(LINES, 18, 5)).toEqual(['line 18', 'line 19']);
  });

  it('returns an empty list past the end', () => {
    expect(visibleLines(LINES, 20, 5)).toEqual([]);
  });
});
