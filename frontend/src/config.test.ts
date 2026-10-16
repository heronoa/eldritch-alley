import { describe, expect, it } from 'vitest';
import { gameServerEndpoint, highlightCoversDefault } from './config';

describe('gameServerEndpoint', () => {
  it('uses the development server when none is declared under vite dev', () => {
    expect(gameServerEndpoint({ DEV: true })).toBe('ws://localhost:2567');
    expect(gameServerEndpoint({ DEV: true, VITE_GAME_SERVER: '' })).toBe('ws://localhost:2567');
  });

  it('throws when no endpoint is declared outside development', () => {
    expect(() => gameServerEndpoint({ DEV: false })).toThrow(/VITE_GAME_SERVER is not set/);
    expect(() => gameServerEndpoint({ DEV: false, VITE_GAME_SERVER: '' })).toThrow(/is not set/);
  });

  it('returns the declared endpoint, in development or not', () => {
    const declared = 'wss://eldritch-game.heronoa.com.br';
    expect(gameServerEndpoint({ DEV: false, VITE_GAME_SERVER: declared })).toBe(declared);
    expect(gameServerEndpoint({ DEV: true, VITE_GAME_SERVER: declared })).toBe(declared);
  });

  it('rejects a value that is not a URL', () => {
    expect(() => gameServerEndpoint({ DEV: false, VITE_GAME_SERVER: 'eldritch-game' })).toThrow(
      /is not a URL/,
    );
  });

  it('rejects a URL that is not a WebSocket', () => {
    expect(() =>
      gameServerEndpoint({ DEV: false, VITE_GAME_SERVER: 'https://eldritch-game.heronoa.com.br' }),
    ).toThrow(/must be ws:\/\/ or wss:\/\//);
  });
});

describe('highlightCoversDefault', () => {
  // The badge and the marks of the rules (ADR 0012) are on unless the build says otherwise, so a
  // player who never opens the settings sees what a shot at a cell costs.
  it('is on for a build that says nothing, in development or not', () => {
    expect(highlightCoversDefault({ DEV: true })).toBe(true);
    expect(highlightCoversDefault({ DEV: false })).toBe(true);
    expect(highlightCoversDefault({ DEV: false, VITE_HIGHLIGHT_COVERS: '' })).toBe(true);
  });

  it('reads the four ways a build can say yes or no', () => {
    for (const yes of ['1', 'true']) {
      expect(highlightCoversDefault({ DEV: false, VITE_HIGHLIGHT_COVERS: yes }), yes).toBe(true);
    }
    for (const no of ['0', 'false']) {
      expect(highlightCoversDefault({ DEV: false, VITE_HIGHLIGHT_COVERS: no }), no).toBe(false);
    }
  });

  it('rejects a declared value that is neither, so a typo fails at load', () => {
    expect(() =>
      highlightCoversDefault({ DEV: false, VITE_HIGHLIGHT_COVERS: 'maybe' }),
    ).toThrow(/VITE_HIGHLIGHT_COVERS/);
  });
});
