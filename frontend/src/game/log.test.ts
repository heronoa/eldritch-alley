import { describe, expect, it } from 'vitest';
import type { Event, RejectReason } from '../protocol';
import { describeEvent, describeRejection } from './log';

const NAMES: Record<string, string> = {
  'A-sniper': 'Sniper',
  'A-wizard': 'Wizard',
  'A-priest': 'Priest',
};

describe('describeEvent', () => {
  it('describes a move with both cells', () => {
    const event: Event = { type: 'moved', actor: 'A-sniper', from: { x: 0, y: 0 }, to: { x: 1, y: 0 } };

    expect(describeEvent(event, NAMES)).toBe('Sniper moveu de (0,0) para (1,0)');
  });

  it('describes a hit with the damage', () => {
    const event: Event = {
      type: 'attacked',
      actor: 'A-sniper',
      target: 'A-priest',
      hit: true,
      damage: 4,
      rngState: 1,
      ammoSpent: true,
    };

    expect(describeEvent(event, NAMES)).toBe('Sniper acertou Priest por 4');
  });

  it('describes a miss without a target', () => {
    const event: Event = {
      type: 'attacked',
      actor: 'A-priest',
      target: 'A-sniper',
      hit: false,
      damage: 0,
      rngState: 1,
      ammoSpent: false,
    };

    expect(describeEvent(event, NAMES)).toBe('Priest errou');
  });

  it('describes a defeat', () => {
    const event: Event = { type: 'unit-defeated', target: 'A-priest' };

    expect(describeEvent(event, NAMES)).toBe('Priest caiu');
  });

  it('describes a removed corpse', () => {
    const event: Event = { type: 'corpse-removed', target: 'A-priest' };

    expect(describeEvent(event, NAMES)).toBe('Corpo de Priest removido');
  });

  it('describes a reload', () => {
    const event: Event = { type: 'reloaded', actor: 'A-sniper' };

    expect(describeEvent(event, NAMES)).toBe('Sniper recarregou');
  });

  it('describes the hand-over of a turn', () => {
    const event: Event = { type: 'turn-ended', actor: 'A-sniper', next: 'A-wizard', round: 1 };

    expect(describeEvent(event, NAMES)).toBe('Vez de Wizard');
  });

  it('falls back for an unknown type', () => {
    const event = { type: 'something-else' } as unknown as Event;

    expect(describeEvent(event, NAMES)).toBe('evento desconhecido');
  });
});

describe('describeRejection', () => {
  // Every reason the engine can answer with, so a new one is a compile error here.
  const SENTENCES: Record<RejectReason, string> = {
    'not-your-turn': 'Não é a sua vez',
    'out-of-bounds': 'Fora do tabuleiro',
    'cell-occupied': 'Casa ocupada',
    'height-step-too-high': 'Desnível alto demais',
    'not-enough-movement': 'Movimento insuficiente',
    'already-acted': 'Ação já usada',
    'target-out-of-range': 'Alvo fora de alcance',
    'target-invalid': 'Alvo inválido',
    'no-magazine': 'Sem carregador',
    'magazine-full': 'Carregador cheio',
    'not-adjacent': 'Casa não adjacente',
    'game-over': 'Partida encerrada',
    'malformed-action': 'Ação inválida',
  };

  it('answers a sentence in the player language for every reason', () => {
    for (const [reason, sentence] of Object.entries(SENTENCES)) {
      expect(describeRejection(reason as RejectReason)).toBe(sentence);
    }
  });

  it('gives each reason a sentence of its own', () => {
    const sentences = Object.keys(SENTENCES).map((reason) => describeRejection(reason as RejectReason));

    expect(new Set(sentences).size).toBe(sentences.length);
  });
});
