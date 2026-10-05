// Localization M1 — the catalogs. pt-BR is the reference: its keys are the type, and a locale that
// has not translated a key gets the Portuguese one. en-US is empty until M3 writes the title.
import { describe, expect, it } from 'vitest';
import { ptBR, type MessageKey } from './catalog.pt-BR';
import { enUS } from './catalog.en-US';
import { message, missingKeys } from './messages';

describe('the pt-BR catalog', () => {
  it('is the reference: every entry is a non-empty string', () => {
    const entries = Object.entries(ptBR);
    expect(entries.length).toBeGreaterThan(0);

    for (const [key, value] of entries) {
      expect(typeof value, key).toBe('string');
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('carries the title screen, keyed by area, with the text the owner wrote', () => {
    expect(ptBR['title.meta']).toBe('SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001');
    expect(ptBR['title.name']).toBe('Eldritch Alley');
    expect(ptBR['title.stampTag']).toBe('TACTICS');
    expect(ptBR['title.tagline']).toBe(
      'Agentes licenciados, magia sem licença e uma cidade inteira de becos. Monte o seu esquadrão e responda à ocorrência.',
    );
    expect(ptBR['title.cta']).toBe('Iniciar partida');
    expect(ptBR['title.ctaBusy']).toBe('Conectando…');
    expect(ptBR['title.hint']).toBe('ou pressione Enter');
    expect(ptBR['title.granted']).toBe('PARTIDA AUTORIZADA');
    expect(ptBR['title.unavailable']).toBe('Servidor indisponível');
    expect(ptBR['title.footerVersion']).toBe('v0.1');
    expect(ptBR['title.footerPlace']).toBe('Belém · madrugada');
  });
});

describe('the en-US catalog', () => {
  it('only holds keys the reference defines', () => {
    for (const key of Object.keys(enUS)) {
      expect(Object.keys(ptBR), key).toContain(key);
    }
  });
});

describe('missingKeys', () => {
  it('answers with nothing for the reference itself', () => {
    expect(missingKeys('pt-BR')).toEqual([]);
  });

  it('lists exactly the reference keys the locale does not translate', () => {
    const expected = (Object.keys(ptBR) as MessageKey[]).filter((key) => !(key in enUS));
    expect(missingKeys('en-US')).toEqual(expected);
  });

  it('reports what is still untranslated without failing on it, so M3 can close the gap', () => {
    const untranslated = missingKeys('en-US');
    console.info(
      untranslated.length === 0
        ? 'en-US is complete'
        : `en-US still untranslated (${untranslated.length}): ${untranslated.join(', ')}`,
    );
    expect(Array.isArray(untranslated)).toBe(true);
  });
});

describe('message', () => {
  it('gives the text of the locale', () => {
    expect(message('pt-BR', 'title.cta')).toBe('Iniciar partida');
  });

  it('falls back to the reference for every key the locale has not translated', () => {
    for (const key of missingKeys('en-US')) {
      expect(message('en-US', key), key).toBe(ptBR[key]);
    }
  });
});
