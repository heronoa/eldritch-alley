// Localization M1, M2 and M3 — the catalogs. pt-BR is the reference: its keys are the type, and a
// locale that has not translated a key gets the Portuguese one. en-US holds the title screen alone,
// which is the whole of what this feature translates.
//
// M2 moved the strings of the game out of the code and in here. The last block is the record of that
// move: it holds the text `develop` had, so a silent change to the Portuguese fails a test.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActionButton } from '../game/actions';
import { COVER_SIDES, type CoverSide } from '../game/coverBadge';
import { describeRejection } from '../game/log';
import type { PanelKey } from '../game/panel';
import type { RejectReason } from '../protocol';
import { ptBR, type MessageKey } from './catalog.pt-BR';
import { enUS } from './catalog.en-US';
import { getLocale, setLocale } from './translate';
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
    expect(ptBR['title.occupied']).toBe('Você já tem uma partida aberta em outra aba');
    expect(ptBR['title.notice.refused']).toBe('ACESSO RECUSADO');
    expect(ptBR['title.notice.loadFailed']).toBe('FALHA AO CARREGAR');
    expect(ptBR['title.loadFailed']).toBe('Não foi possível carregar a partida');
    expect(ptBR['title.notice.close']).toBe('Fechar');
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
    expect(enUS['title.occupied']).toBe('You already have a match open in another tab');
    expect(enUS['title.notice.refused']).toBe('ACCESS REFUSED');
    expect(enUS['title.notice.loadFailed']).toBe('FAILED TO LOAD');
    expect(enUS['title.loadFailed']).toBe('The match could not be loaded');
    expect(enUS['title.notice.close']).toBe('Close');
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
  // What the game shows is read through `t`, so the locale is pinned here, not left to the runtime.
  let previous = getLocale();
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  it('carries the sentences of the battle log, with their placeholders', () => {
    expect(ptBR['log.event.moved']).toBe('{actor} moveu de {from} para {to}');
    expect(ptBR['log.event.attacked']).toBe('{actor} acertou {target} por {damage}');
    expect(ptBR['log.event.missed']).toBe('{actor} errou {target}');
    expect(ptBR['log.event.reloaded']).toBe('{actor} recarregou');
    // The refill of a magic class' pool, which the engine calls a reload all the same (ADR 0011 §3).
    expect(ptBR['log.event.meditated']).toBe('{actor} meditou');
    expect(enUS['log.event.meditated']).toBe('{actor} meditated');
    expect(ptBR['log.event.defeated']).toBe('{target} caiu');
    expect(ptBR['log.event.corpseRemoved']).toBe('Corpo de {target} removido');
    expect(ptBR['log.event.turnEnded']).toBe('Vez de {next}');
    expect(ptBR['log.event.unknown']).toBe('evento desconhecido');
  });

  it('carries the four cover sentences of an attack in both catalogs', () => {
    // The engine's word for the effect is cover; the screen's word is the fiction's (ADR 0012 § D3).
    // Which end of the shot the crate was on is the whole difference between the pairs.
    expect(message('pt-BR', 'log.event.attackedCover')).toBe('{actor} acertou {target} por {damage} em cobertura');
    expect(message('en-US', 'log.event.attackedCover')).toBe('{actor} hit {target} for {damage} in cover');
    expect(message('pt-BR', 'log.event.missedCover')).toBe('{actor} errou {target} em cobertura');
    expect(message('en-US', 'log.event.missedCover')).toBe('{actor} missed {target} in cover');
    expect(message('pt-BR', 'log.event.attackedFromCover')).toBe('{actor}, em cobertura, acertou {target} por {damage}');
    expect(message('en-US', 'log.event.attackedFromCover')).toBe('{actor}, in cover, hit {target} for {damage}');
    expect(message('pt-BR', 'log.event.missedFromCover')).toBe('{actor}, em cobertura, errou {target}');
    expect(message('en-US', 'log.event.missedFromCover')).toBe('{actor}, in cover, missed {target}');
    expect(message('pt-BR', 'log.event.attackedBothCover')).toBe(
      '{actor}, em cobertura, acertou {target} por {damage}, que também estava em cobertura',
    );
    expect(message('en-US', 'log.event.attackedBothCover')).toBe(
      '{actor}, in cover, hit {target} for {damage}, who was in cover too',
    );
    expect(message('pt-BR', 'log.event.missedBothCover')).toBe(
      '{actor}, em cobertura, errou {target}, que também estava em cobertura',
    );
    expect(message('en-US', 'log.event.missedBothCover')).toBe(
      '{actor}, in cover, missed {target}, who was in cover too',
    );
  });

  it('carries the badge of a unit in cover, one name per side, in both catalogs', () => {
    // The sides are the board's own (m3-02 fixes east as +x), and the badge names them in the order
    // the module reads them (ADR 0012 § D5 is what they mean).
    const sides: Record<CoverSide, string> = {
      north: 'norte',
      northeast: 'nordeste',
      east: 'leste',
      southeast: 'sudeste',
      south: 'sul',
      southwest: 'sudoeste',
      west: 'oeste',
      northwest: 'noroeste',
    };
    const english: Record<CoverSide, string> = {
      north: 'North',
      northeast: 'Northeast',
      east: 'East',
      southeast: 'Southeast',
      south: 'South',
      southwest: 'Southwest',
      west: 'West',
      northwest: 'Northwest',
    };

    for (const side of COVER_SIDES) {
      expect(message('pt-BR', `hud.cover.${side}`), side).toBe(sides[side]);
      expect(message('en-US', `hud.cover.${side}`), side).toBe(english[side]);
    }

    expect(message('pt-BR', 'hud.cover.sides')).toBe('Em cobertura a {sides}');
    expect(message('en-US', 'hud.cover.sides')).toBe('In cover for {sides}');
    expect(message('pt-BR', 'hud.cover.and')).toBe(' e ');
    expect(message('en-US', 'hud.cover.and')).toBe(' and ');
    // The label of the checkbox is the owner's own wording.
    expect(ptBR['hud.settings.highlightCovers']).toBe('Realçar Coberturas');
    expect(message('en-US', 'hud.settings.highlightCovers')).toBe('Highlight Covers');
  });

  it('answers every refusal code out of the catalog, keyed by the code itself', () => {
    // A code with no key of its own is a compile error: the key is built from the code.
    const reasons: readonly RejectReason[] = [
      'not-your-turn',
      'out-of-bounds',
      'cell-occupied',
      'height-step-too-high',
      'no-path',
      'already-acted',
      'target-out-of-range',
      'target-invalid',
      'no-magazine',
      'no-ammunition',
      'no-mana',
      'magazine-full',
      'game-over',
      'stale-turn',
      'malformed-action',
      'no-line-of-sight',
      'no-pending-move',
      'ability-unknown',
    ];

    for (const reason of reasons) {
      expect(describeRejection(reason), reason).toBe(message('pt-BR', `log.rejection.${reason}`));
    }
  });

  it('carries the line-of-sight refusal in both catalogs', () => {
    expect(message('pt-BR', 'log.rejection.no-line-of-sight')).toBe('Sem linha de visão');
    expect(message('en-US', 'log.rejection.no-line-of-sight')).toBe('No line of sight');
  });

  it('carries the no-path refusal in both catalogs', () => {
    expect(message('pt-BR', 'log.rejection.no-path')).toBe('Sem caminho');
    expect(message('en-US', 'log.rejection.no-path')).toBe('No path');
  });

  it('carries the two empty-resource refusals in both catalogs', () => {
    expect(message('pt-BR', 'log.rejection.no-ammunition')).toBe('Sem munição, recarregue');
    expect(message('en-US', 'log.rejection.no-ammunition')).toBe('No ammunition — reload');
    // The pool of a magic class is energy on the screen; the engine's own name for it is mana, which
    // is the code the key is spelled with (ADR 0011).
    expect(message('pt-BR', 'log.rejection.no-mana')).toBe('Sem energia, medite');
    expect(message('en-US', 'log.rejection.no-mana')).toBe('No energy — meditate');
  });

  it('carries the unit panel labels, keyed by the row they belong to', () => {
    const labels: Record<PanelKey, string> = {
      hp: 'HP',
      movement: 'Movimento',
      action: 'Ação',
      ammo: 'Munição',
      reaction: 'Reação',
      energy: 'Energia',
    };

    for (const key of Object.keys(labels) as PanelKey[]) {
      expect(message('pt-BR', `panel.label.${key}`), key).toBe(labels[key]);
    }

    expect(ptBR['panel.value.spent']).toBe('Gasta');
    expect(ptBR['panel.value.available']).toBe('Disponível');
  });

  it('carries the five action buttons, keyed by the action each sends', () => {
    const labels: Record<ActionButton['id'], string> = {
      move: 'Mover',
      attack: 'Atacar',
      ability: 'Habilidade',
      reload: 'Recarregar',
      endTurn: 'Terminar turno',
    };

    for (const id of Object.keys(labels) as ActionButton['id'][]) {
      expect(message('pt-BR', `action.${id}`), id).toBe(labels[id]);
    }
  });

  it('carries the sentences of an ability, in the reference catalog', () => {
    // The three events of a use (ADR 0016 §8), one sentence each, with the placeholders the log fills.
    expect(ptBR['log.event.ability-used']).toBe('{actor} usou uma habilidade em {cell}');
    expect(ptBR['log.event.damaged']).toBe('{target} sofreu {damage} de dano');
    expect(ptBR['log.event.healed']).toBe('{target} recuperou {amount} de vida');
  });

  it('carries the ability button and its unknown-ability refusal in both catalogs', () => {
    expect(message('pt-BR', 'action.ability')).toBe('Habilidade');
    expect(message('en-US', 'action.ability')).toBe('Ability');
    // The actor names an id its slots do not carry, or the catalog does not define (ADR 0016 §7).
    expect(message('pt-BR', 'log.rejection.ability-unknown')).toBe('Habilidade desconhecida');
    expect(message('en-US', 'log.rejection.ability-unknown')).toBe('Unknown ability');
  });

  it('carries the HUD lines', () => {
    expect(ptBR['hud.legend']).toBe(
      'Azul-tinta: você · Vermelho: bot · Papel: selecionado\nRealce azul: movimento · Realce vermelho: ataque',
    );
    expect(ptBR['hud.panel.log']).toBe('Registro');
    expect(ptBR['hud.back']).toBe('Voltar ao início');
  });

  it('carries the turn banner in both catalogs, one line per side', () => {
    expect(message('pt-BR', 'hud.banner.yourTurn')).toBe('Sua vez');
    expect(message('pt-BR', 'hud.banner.enemyTurn')).toBe('Vez do inimigo');
    expect(message('en-US', 'hud.banner.yourTurn')).toBe('Your turn');
    expect(message('en-US', 'hud.banner.enemyTurn')).toBe('Enemy turn');
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
