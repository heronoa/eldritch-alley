import { describe, expect, it } from 'vitest';
import { gameServerEndpoint } from './config';

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
