// Localization M1, M2 and M3 — the catalogs. pt-BR is the reference: its keys are the type, and a
// locale that has not translated a key gets the Portuguese one. en-US holds the title screen alone,
// which is the whole of what this feature translates.
//
// M2 moved the strings of the game out of the code and in here. The last block is the record of that
// move: it holds the text `develop` had, so a silent change to the Portuguese fails a test.
import { describe, expect, it } from 'vitest';
import type { ActionButton } from '../game/actions';
import { describeRejection } from '../game/log';
import type { PanelKey } from '../game/panel';
import type { RejectReason } from '../protocol';
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
    expect(ptBR['title.language']).toBe('Idioma');
  });
});

describe('the en-US catalog', () => {
  it('only holds keys the reference defines', () => {
    for (const key of Object.keys(enUS)) {
      expect(Object.keys(ptBR), key).toContain(key);
    }
  });

  it('translates the whole title screen, which is what this feature ships', () => {
    // Decision 5: with M3 done, the title's keys are required. A gap here is a title line that would
    // show up in Portuguese inside an English screen.
    const untranslatedTitle = missingKeys('en-US').filter((key) => key.startsWith('title.'));
    expect(untranslatedTitle).toEqual([]);
  });

  it('carries the English copy the owner reviews before this milestone closes', () => {
    expect(enUS['title.document']).toBe('Eldritch Alley: Tactics');
    expect(enUS['title.meta']).toBe('BUREAU OF OCCULT AFFAIRS · INCIDENT NO. 2026/0001');
    expect(enUS['title.name']).toBe('Eldritch Alley');
    expect(enUS['title.stampTag']).toBe('TACTICS');
    expect(enUS['title.tagline']).toBe(
      'Licensed agents, unlicensed magic, and a whole city of alleys. Assemble your squad and respond to the incident.',
    );
    expect(enUS['title.cta']).toBe('Start match');
    expect(enUS['title.ctaBusy']).toBe('Connecting…');
    expect(enUS['title.hint']).toBe('or press Enter');
    expect(enUS['title.granted']).toBe('MATCH AUTHORIZED');
    expect(enUS['title.unavailable']).toBe('Server unavailable');
    expect(enUS['title.footerVersion']).toBe('v0.1');
    expect(enUS['title.footerPlace']).toBe('Belém · the small hours');
    expect(enUS['title.language']).toBe('Language');
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

  it('reports what is still untranslated without failing on it, so the next area starts from a list', () => {
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

/**
 * What M2 moved, held against the text `develop` had. The log, the panel, the copy of the title and
 * the map names also assert their own output where they are read; this block is the record of the
 * extraction itself, area by area.
 */
describe('the pt-BR the game shows', () => {
  it('carries the sentences of the battle log, with their placeholders', () => {
    expect(ptBR['log.event.moved']).toBe('{actor} moveu de {from} para {to}');
    expect(ptBR['log.event.attacked']).toBe('{actor} acertou {target} por {damage}');
    expect(ptBR['log.event.missed']).toBe('{actor} errou');
    expect(ptBR['log.event.reloaded']).toBe('{actor} recarregou');
    expect(ptBR['log.event.defeated']).toBe('{target} caiu');
    expect(ptBR['log.event.corpseRemoved']).toBe('Corpo de {target} removido');
    expect(ptBR['log.event.turnEnded']).toBe('Vez de {next}');
    expect(ptBR['log.event.unknown']).toBe('evento desconhecido');
  });

  it('answers every refusal code out of the catalog, keyed by the code itself', () => {
    // A code with no key of its own is a compile error: the key is built from the code.
    const reasons: readonly RejectReason[] = [
      'not-your-turn',
      'out-of-bounds',
      'cell-occupied',
      'height-step-too-high',
      'not-enough-movement',
      'already-acted',
      'target-out-of-range',
      'target-invalid',
      'no-magazine',
      'magazine-full',
      'not-adjacent',
      'game-over',
      'malformed-action',
    ];

    for (const reason of reasons) {
      expect(describeRejection(reason), reason).toBe(message('pt-BR', `log.rejection.${reason}`));
    }
  });

  it('carries the unit panel labels, keyed by the row they belong to', () => {
    const labels: Record<PanelKey, string> = {
      hp: 'HP',
      movement: 'Movimento',
      action: 'Ação',
      ammo: 'Munição',
      reaction: 'Reação',
      mana: 'Mana',
    };

    for (const key of Object.keys(labels) as PanelKey[]) {
      expect(message('pt-BR', `panel.label.${key}`), key).toBe(labels[key]);
    }

    expect(ptBR['panel.value.spent']).toBe('Gasta');
    expect(ptBR['panel.value.available']).toBe('Disponível');
  });

  it('carries the four action buttons, keyed by the action each sends', () => {
    const labels: Record<ActionButton['id'], string> = {
      move: 'Mover',
      attack: 'Atacar',
      reload: 'Recarregar',
      endTurn: 'Terminar turno',
    };

    for (const id of Object.keys(labels) as ActionButton['id'][]) {
      expect(message('pt-BR', `action.${id}`), id).toBe(labels[id]);
    }
  });

  it('carries the HUD lines', () => {
    expect(ptBR['hud.legend']).toBe(
      'Azul-tinta: você · Vermelho: bot · Papel: selecionado\nRealce azul: movimento · Realce vermelho: ataque',
    );
    expect(ptBR['hud.panel.unit']).toBe('Unidade');
    expect(ptBR['hud.panel.log']).toBe('Registro');
    expect(ptBR['hud.back']).toBe('Voltar ao início');
  });

  it('carries the match status lines', () => {
    expect(ptBR['match.versionMismatch']).toBe('Versão incompatível');
    expect(ptBR['match.victory']).toBe('Vitória');
    expect(ptBR['match.defeat']).toBe('Derrota');
    expect(ptBR['match.reconnecting']).toBe('Reconectando...');
    expect(ptBR['match.lost']).toBe('Partida perdida');
  });

  it('carries the name each of the three maps answers to', () => {
    expect(ptBR['map.street.title']).toBe('Rua do Comércio e beco');
    expect(ptBR['map.park.title']).toBe('Praça Municipal nº 3');
    expect(ptBR['map.roof.title']).toBe('Edifício Central, cobertura');
  });

  it('carries the document title the markup opens with', () => {
    expect(ptBR['title.document']).toBe('Eldritch Alley: Tactics');
  });
});
