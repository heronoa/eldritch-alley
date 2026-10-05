// Localization M1 — `t(key, params?)` and the locale it answers in. The messages the audit moves in
// M2 are the ones that carry placeholders, so the interpolation is tested on its own here.
import { afterEach, describe, expect, it } from 'vitest';
import { ptBR } from './catalog.pt-BR';
import { getLocale, interpolate, setLocale, t } from './translate';

afterEach(() => {
  setLocale('en-US');
});

describe('interpolate', () => {
  it('replaces the named placeholders with the params', () => {
    expect(
      interpolate('{actor} moveu de {from} para {to}', {
        actor: 'Ana',
        from: '(1,2)',
        to: '(3,4)',
      }),
    ).toBe('Ana moveu de (1,2) para (3,4)');
  });

  it('accepts a number as a param', () => {
    expect(interpolate('{actor} acertou {target} por {damage}', { damage: 3 })).toBe(
      '{actor} acertou {target} por 3',
    );
  });

  it('leaves a message with no placeholders alone', () => {
    expect(interpolate('Sem carregador')).toBe('Sem carregador');
    expect(interpolate('Sem carregador', { actor: 'Ana' })).toBe('Sem carregador');
  });

  it('keeps the placeholder of a missing param, so the gap is visible', () => {
    expect(interpolate('{actor} errou', {})).toBe('{actor} errou');
  });
});

describe('t', () => {
  it('opens in the fallback locale, and falls back to the reference text', () => {
    expect(getLocale()).toBe('en-US');
    expect(t('title.cta')).toBe(ptBR['title.cta']);
  });

  it('answers in the locale the player chose', () => {
    setLocale('pt-BR');
    expect(getLocale()).toBe('pt-BR');
    expect(t('title.cta')).toBe('Iniciar partida');
  });

  it('passes the params to the message', () => {
    setLocale('pt-BR');
    expect(t('title.granted', { unused: 'ignorado' })).toBe('PARTIDA AUTORIZADA');
  });
});
