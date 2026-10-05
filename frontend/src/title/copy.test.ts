// Localization M1 and M3 — the title screen's copy. M1 held the Portuguese in one place so the
// markup and the screen could not drift apart; M3 made it follow the language, so every test here
// names the locale it reads, and the English the owner reviews is asserted in both places it lives.
import { describe, expect, it } from 'vitest';
import { setLocale, type Locale } from '../i18n';
import { titleCopy, type TitleCopy } from './copy';

/** The title's lines in a named language: the copy is read in the locale the test means. */
function copyIn(locale: Locale): TitleCopy {
  setLocale(locale);
  return titleCopy();
}

describe('the copy of the title', () => {
  it('has a string for every line of the screen, in either language, and none of them empty', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const entries = Object.entries(copyIn(locale));
      expect(entries.length, locale).toBeGreaterThan(0);

      for (const [name, value] of entries) {
        expect(typeof value, `${locale} ${name}`).toBe('string');
        expect(value.trim(), `${locale} ${name}`).not.toBe('');
      }
    }
  });

  it('starts the match with the words the owner chose', () => {
    const copy = copyIn('pt-BR');
    expect(copy.cta).toBe('Iniciar partida');
    expect(copy.ctaBusy).toBe('Conectando…');
  });

  it('ships the version alone, without the word for a prototype', () => {
    for (const locale of ['pt-BR', 'en-US'] as const) {
      const copy = copyIn(locale);
      expect(copy.footerVersion, locale).toBe('v0.1');
      expect(copy.footerVersion, locale).not.toContain('protótipo');
      expect(copy.footerPlace, locale).not.toContain('protótipo');
    }
  });

  it('keeps the lines the prototype wrote, in Portuguese', () => {
    const copy = copyIn('pt-BR');
    expect(copy.meta).toBe('SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001');
    expect(copy.name).toBe('Eldritch Alley');
    expect(copy.stampTag).toBe('TACTICS');
    expect(copy.tagline).toBe(
      'Agentes licenciados, magia sem licença e uma cidade inteira de becos. Monte o seu esquadrão e responda à ocorrência.',
    );
    expect(copy.hint).toBe('ou pressione Enter');
    expect(copy.granted).toBe('PARTIDA AUTORIZADA');
    expect(copy.unavailable).toBe('Servidor indisponível');
    expect(copy.occupied).toBe('Você já tem uma partida aberta em outra aba');
    expect(copy.noticeRefused).toBe('ACESSO RECUSADO');
    expect(copy.noticeLoadFailed).toBe('FALHA AO CARREGAR');
    expect(copy.loadFailed).toBe('Não foi possível carregar a partida');
    expect(copy.noticeClose).toBe('Fechar');
    expect(copy.language).toBe('Idioma');
  });

  it('says the same screen in English, with the setting left in Portuguese', () => {
    const copy = copyIn('en-US');
    expect(copy.document).toBe('Eldritch Alley: Tactics');
    expect(copy.meta).toBe('BUREAU OF OCCULT AFFAIRS · INCIDENT NO. 2026/0001');
    expect(copy.name).toBe('Eldritch Alley');
    expect(copy.stampTag).toBe('TACTICS');
    expect(copy.tagline).toBe(
      'Licensed agents, unlicensed magic, and a whole city of alleys. Assemble your squad and respond to the incident.',
    );
    expect(copy.cta).toBe('Start match');
    expect(copy.ctaBusy).toBe('Connecting…');
    expect(copy.hint).toBe('or press Enter');
    expect(copy.granted).toBe('MATCH AUTHORIZED');
    expect(copy.unavailable).toBe('Server unavailable');
    expect(copy.occupied).toBe('You already have a match open in another tab');
    expect(copy.noticeRefused).toBe('ACCESS REFUSED');
    expect(copy.noticeLoadFailed).toBe('FAILED TO LOAD');
    expect(copy.loadFailed).toBe('The match could not be loaded');
    expect(copy.noticeClose).toBe('Close');
    expect(copy.footerVersion).toBe('v0.1');
    expect(copy.footerPlace).toBe('Belém · the small hours');
    expect(copy.language).toBe('Language');
  });

  it('follows the locale the client is in, because the switcher reads it again on a press', () => {
    setLocale('en-US');
    expect(titleCopy().hint).toBe('or press Enter');

    setLocale('pt-BR');
    expect(titleCopy().hint).toBe('ou pressione Enter');
  });
});
