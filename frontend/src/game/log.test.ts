import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getLocale, setLocale } from '../i18n/translate';
import type { Event, Position, Prop, RejectReason, UnitId } from '../protocol';
import { describeEvent, describeRejection, type Battlefield } from './log';

const NAMES: Record<string, string> = {
  'A-sniper': 'Sniper',
  'A-wizard': 'Wizard',
  'A-priest': 'Priest',
};

function coverAt(x: number, y: number): Prop {
  return { position: { x, y }, kind: 'cover' };
}

/** The board and the positions of one moment, handed in the way the scene hands them to `describeEvent`. */
function battlefieldWith(
  props: readonly Prop[],
  positions: Readonly<Record<UnitId, Position>>,
): Battlefield {
  return {
    board: {
      width: 8,
      height: 8,
      levels: new Array<number>(64).fill(0),
      props,
    },
    positions,
  };
}

/** The shot of the cases: the sniper at the priest, landing unless the case says otherwise. */
function attacked(overrides: Partial<Extract<Event, { type: 'attacked' }>> = {}): Event {
  return {
    type: 'attacked',
    actor: 'A-sniper',
    target: 'A-priest',
    hit: true,
    damage: 4,
    rngState: 1,
    resource: 'ammo',
    cover: false,
    ...overrides,
  };
}

/** The same shot, missing. */
function missed(overrides: Partial<Extract<Event, { type: 'attacked' }>> = {}): Event {
  return attacked({ hit: false, damage: 0, ...overrides });
}

describe('describeEvent', () => {
  // The sentences are the pt-BR ones, so the locale is pinned, as it is for the refusals below.
  let previous = getLocale();
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  it('describes a move with both cells', () => {
    const event: Event = {
      type: 'moved',
      actor: 'A-sniper',
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      path: [{ x: 1, y: 0 }],
    };

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
      resource: 'ammo',
      cover: false,
    };

    expect(describeEvent(event, NAMES)).toBe('Sniper acertou Priest por 4');
  });

  it('describes a miss with its target', () => {
    expect(describeEvent(missed(), NAMES)).toBe('Sniper errou Priest');
  });

  it('says when the target was in cover, so the missed chance is not left unexplained', () => {
    // The engine carries `cover` on the event (ADR 0012), and the sentence says which end of the shot
    // the crate was on: the target's, here, on the shot that landed and on the one that did not.
    expect(describeEvent(attacked({ cover: true }), NAMES)).toBe(
      'Sniper acertou Priest por 4 em cobertura',
    );
    expect(describeEvent(missed({ cover: true }), NAMES)).toBe('Sniper errou Priest em cobertura');
  });

  it('says when the shooter itself was in cover', () => {
    // The engine answers for the target alone, because that is what the shot costs. The other end is
    // read on the board the scene hands in, with the same rule (ADR 0012 § D4).
    const battlefield = battlefieldWith([coverAt(1, 0)], { 'A-sniper': { x: 0, y: 0 }, 'A-priest': { x: 4, y: 0 } });

    expect(describeEvent(attacked({ actor: 'A-sniper' }), NAMES, battlefield)).toBe(
      'Sniper, em cobertura, acertou Priest por 4',
    );
    expect(describeEvent(missed({ actor: 'A-sniper' }), NAMES, battlefield)).toBe(
      'Sniper, em cobertura, errou Priest',
    );
  });

  it('says both ends when both were in cover', () => {
    const battlefield = battlefieldWith([coverAt(1, 0), coverAt(3, 0)], {
      'A-sniper': { x: 0, y: 0 },
      'A-priest': { x: 4, y: 0 },
    });

    expect(describeEvent(attacked({ cover: true }), NAMES, battlefield)).toBe(
      'Sniper, em cobertura, acertou Priest por 4, que também estava em cobertura',
    );
    expect(describeEvent(missed({ cover: true }), NAMES, battlefield)).toBe(
      'Sniper, em cobertura, errou Priest, que também estava em cobertura',
    );
  });

  it('names no cover at all when it is handed no battlefield and the target had none', () => {
    // The scene hands the board and the positions of the events it is playing; without them the
    // sentence is the one the event alone can carry.
    expect(describeEvent(attacked(), NAMES)).toBe('Sniper acertou Priest por 4');
    expect(describeEvent(attacked(), NAMES, battlefieldWith([coverAt(1, 0)], {}))).toBe(
      'Sniper acertou Priest por 4',
    );
  });

  it('describes a defeat', () => {
    const event: Event = { type: 'unit-defeated', target: 'A-priest' };

    expect(describeEvent(event, NAMES)).toBe('Priest caiu');
  });

  it('describes a removed corpse', () => {
    const event: Event = { type: 'corpse-removed', target: 'A-priest' };

    expect(describeEvent(event, NAMES)).toBe('Corpo de Priest removido');
  });

  it('describes a reload of a magazine', () => {
    const event: Event = { type: 'reloaded', actor: 'A-sniper', resource: 'ammo' };

    expect(describeEvent(event, NAMES)).toBe('Sniper recarregou');
  });

  it('describes the refill of a magic class as a meditation, not as a reload', () => {
    // One action in the engine, two words on the screen (ADR 0011): the pool says which one.
    const event: Event = { type: 'reloaded', actor: 'A-wizard', resource: 'mana' };

    expect(describeEvent(event, NAMES)).toBe('Wizard meditou');
  });

  it('describes the refill of a unit with no pool with the engine own word, a reload', () => {
    const event: Event = { type: 'reloaded', actor: 'A-sniper', resource: null };

    expect(describeEvent(event, NAMES)).toBe('Sniper recarregou');
  });

  it('describes the hand-over of a turn', () => {
    const event: Event = { type: 'turn-ended', actor: 'A-sniper', next: 'A-wizard', round: 1 };

    expect(describeEvent(event, NAMES)).toBe('Vez de Wizard');
  });

  it('describes the point a magic pool hands back at the start of the turn', () => {
    // ADR 0017: one point, magic pools only, so the sentence names the pool it came from.
    const event: Event = { type: 'regained', actor: 'A-wizard', resource: 'mana', amount: 1 };

    expect(describeEvent(event, NAMES)).toBe('Wizard recuperou 1 de mana');
  });

  it('falls back for an unknown type', () => {
    const event = { type: 'something-else' } as unknown as Event;

    expect(describeEvent(event, NAMES)).toBe('evento desconhecido');
  });
});

describe('describeRejection', () => {
  // The sentences are the pt-BR ones, so the locale is pinned: the test must not depend on the runtime.
  let previous = getLocale();
  beforeEach(() => {
    previous = getLocale();
    setLocale('pt-BR');
  });
  afterEach(() => setLocale(previous));

  // Every reason the engine can answer with, so a new one is a compile error here.
  const SENTENCES: Record<RejectReason, string> = {
    'not-your-turn': 'Não é a sua vez',
    'out-of-bounds': 'Fora do tabuleiro',
    'cell-occupied': 'Casa ocupada',
    'height-step-too-high': 'Desnível alto demais',
    'no-path': 'Sem caminho',
    'already-acted': 'Ação já usada',
    'target-out-of-range': 'Alvo fora de alcance',
    'no-line-of-sight': 'Sem linha de visão',
    'target-invalid': 'Alvo inválido',
    'no-magazine': 'Sem carregador',
    'no-ammunition': 'Sem munição, recarregue',
    'no-mana': 'Sem energia, medite',
    'magazine-full': 'Carregador cheio',
    'game-over': 'Partida encerrada',
    'stale-turn': 'Ordem atrasada',
    'malformed-action': 'Ação inválida',
    'no-pending-move': 'Nenhum movimento pendente',
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
