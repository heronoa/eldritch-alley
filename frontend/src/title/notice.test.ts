// Title screen — the failure notice: which lines the card shows for each reason it can be opened
// with, and that it reads the copy of the language on screen rather than the locale itself.
import { describe, expect, it } from 'vitest';
import { setLocale, type Locale } from '../i18n';
import { titleCopy, type TitleCopy } from './copy';
import { noticeFor, type FailureReason } from './notice';

const REASONS: readonly FailureReason[] = ['occupied', 'unavailable', 'load-failed'];

/** The title's lines in a named language: the notice reads the copy it is handed. */
function copyIn(locale: Locale): TitleCopy {
  setLocale(locale);
  return titleCopy();
}

describe('noticeFor', () => {
  it('answers a heading, a body and a close label for every reason', () => {
    const copy = copyIn('pt-BR');

    for (const reason of REASONS) {
      const notice = noticeFor(copy, reason);
      expect(notice.heading.trim(), reason).not.toBe('');
      expect(notice.body.trim(), reason).not.toBe('');
      expect(notice.close.trim(), reason).not.toBe('');
    }
  });

  it('gives the two refused seats one heading, and the failed download its own', () => {
    const copy = copyIn('pt-BR');

    expect(noticeFor(copy, 'occupied').heading).toBe(noticeFor(copy, 'unavailable').heading);
    expect(noticeFor(copy, 'load-failed').heading).not.toBe(noticeFor(copy, 'occupied').heading);
  });

  it('takes the body of each reason from its own line', () => {
    const copy = copyIn('pt-BR');

    expect(noticeFor(copy, 'occupied').body).toBe(copy.occupied);
    expect(noticeFor(copy, 'unavailable').body).toBe(copy.unavailable);
    expect(noticeFor(copy, 'load-failed').body).toBe(copy.loadFailed);
    expect(noticeFor(copy, 'occupied').close).toBe(copy.noticeClose);
  });

  it('reads the copy it was handed, so one reason answers in the language on screen', () => {
    const portuguese = copyIn('pt-BR');
    const english = copyIn('en-US');

    expect(english.noticeRefused).not.toBe(portuguese.noticeRefused);
    expect(noticeFor(english, 'occupied').heading).toBe(english.noticeRefused);
    expect(noticeFor(portuguese, 'occupied').heading).toBe(portuguese.noticeRefused);
    expect(noticeFor(english, 'load-failed').body).toBe(english.loadFailed);
  });

  it('leaves the copy it was handed alone', () => {
    const copy = copyIn('pt-BR');
    const snapshot = { ...copy };

    noticeFor(copy, 'load-failed');

    expect(copy).toEqual(snapshot);
  });
});
