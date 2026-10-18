import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRIVACY_VERSION } from './privacy';

// The policy's date is duplicated on purpose (D5): the platform stores it in `privacy_version_seen`,
// and the page shows it as text. One import is impossible across the two workspaces, so this is the
// seam that catches an edit to the policy that forgot to bump the version the platform records.
describe('PRIVACY_VERSION', () => {
  it('is the date the policy page shows', () => {
    const page = readFileSync(
      new URL('../../../frontend/public/privacidade.html', import.meta.url),
      'utf8',
    );
    const shown = /<time[^>]*datetime="(\d{4}-\d{2}-\d{2})"/.exec(page);

    expect(PRIVACY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(shown?.[1]).toBe(PRIVACY_VERSION);
  });
});
