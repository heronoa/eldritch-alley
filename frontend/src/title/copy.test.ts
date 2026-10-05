// Title screen M1 — the Portuguese of the title screen, held in one place so the markup and the
// screen cannot drift apart.
import { describe, expect, it } from 'vitest';
import * as copy from './copy';

describe('the copy of the title', () => {
  it('has a string for every line of the screen, and none of them empty', () => {
    const entries = Object.entries(copy);
    expect(entries.length).toBeGreaterThan(0);

    for (const [name, value] of entries) {
      expect(typeof value, name).toBe('string');
      expect(String(value).trim(), name).not.toBe('');
    }
  });

  it('starts the match with the words the owner chose', () => {
    expect(copy.CTA).toBe('Iniciar partida');
    expect(copy.CTA_BUSY).toBe('Conectando…');
  });

  it('ships the version alone, without the word for a prototype', () => {
    expect(copy.FOOTER_VERSION).toBe('v0.1');
    expect(copy.FOOTER_VERSION).not.toContain('protótipo');
    expect(copy.FOOTER_PLACE).not.toContain('protótipo');
  });

  it('keeps the other lines the prototype wrote', () => {
    expect(copy.META).toBe('SECRETARIA DE ASSUNTOS OCULTOS · OCORRÊNCIA Nº 2026/0001');
    expect(copy.TITLE).toBe('Eldritch Alley');
    expect(copy.STAMP_TAG).toBe('TACTICS');
    expect(copy.HINT).toBe('ou pressione Enter');
    expect(copy.GRANTED).toBe('PARTIDA AUTORIZADA');
    expect(copy.UNAVAILABLE).toBe('Servidor indisponível');
  });
});
