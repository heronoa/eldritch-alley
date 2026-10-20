// EA-17: the one piece of I/O behind the battle report's export button. Turning a string into a file
// is not pure, so it stays out of `game/battle-report.ts`; it is an object's method rather than a bare
// function so a test can spy on it without touching the DOM — the Node test run has neither `Blob` nor
// `document` — the same seam `UnitSprite.prototype.setCoverBadge` already is for the sprite's text.
export const download = {
  text(fileName: string, content: string): void {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
