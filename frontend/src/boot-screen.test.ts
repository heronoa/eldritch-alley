import { describe, expect, it } from 'vitest';
import { screenFor } from './boot-screen';

describe('the screen a path names', () => {
  it('is the title for the root and for a path this build does not know', () => {
    for (const path of ['/', '', '/some/other/page', '/verify-email-again']) {
      expect(screenFor(path), path).toBe('title');
    }
  });

  it('is the page a mailed link lands on, by its own path', () => {
    expect(screenFor('/verify-email')).toBe('verify-email');
    expect(screenFor('/reset-password')).toBe('reset-password');
  });

  it('ignores a trailing slash, which a link may or may not carry', () => {
    expect(screenFor('/verify-email/')).toBe('verify-email');
    expect(screenFor('/reset-password//')).toBe('reset-password');
    expect(screenFor('/')).toBe('title');
  });

  it('only matches the whole path: a deeper address is not the page', () => {
    expect(screenFor('/verify-email/extra')).toBe('title');
    expect(screenFor('/reset-password/step/2')).toBe('title');
  });
});
