// EA-17: the battle report at the end of a match. Pure — the scene owns the unbounded history and
// the one piece of I/O that turns this module's string into a download (`scenes/download.ts`); this
// module only knows how to format what it is handed and how to keep a scroll offset inside range.

/** What the exported file's header names: the result the player already read on the screen, and when
 * the file was written, from the client's own clock — no event carries a timestamp. */
export interface BattleReportHeader {
  readonly result: string;
  readonly endedAt: Date;
}

/** The whole match, one line per event, as a single plain-text blob: the header first, then every
 * line the scene ever logged, in the order it was played. */
export function exportText(header: BattleReportHeader, lines: readonly string[]): string {
  const stamp = header.endedAt.toISOString().replace('T', ' ').slice(0, 19);
  return [header.result, stamp, '', ...lines].join('\n');
}

/** A filesystem-safe name for the download, built from the same clock. */
export function exportFileName(endedAt: Date): string {
  const iso = endedAt.toISOString();
  const date = iso.slice(0, 10);
  const time = iso.slice(11, 19).replace(/:/g, '-');
  return `eldritch-alley-${date}-${time}.txt`;
}

/** Keeps a scroll offset inside `[0, max(0, total - visible)]`. A report shorter than the panel
 * scrolls nowhere, and scrolling past either end clamps instead of wrapping. */
export function clampScroll(offset: number, total: number, visible: number): number {
  const max = Math.max(0, total - visible);
  return Math.min(Math.max(0, offset), max);
}

/** The slice of `lines` the panel draws at `offset`, at most `visible` of them. */
export function visibleLines(lines: readonly string[], offset: number, visible: number): string[] {
  return lines.slice(offset, offset + visible);
}
