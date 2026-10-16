// The build's configuration, read from `import.meta.env`. It is the only place the client reads it,
// so every value has one rule: what it may be, and what it is when the build does not declare it.
import { HIGHLIGHT_COVERS_DEFAULT } from './game/highlightCovers';

/** The development endpoint. It exists only in development: a build for players must declare its own. */
const DEV_GAME_SERVER = 'ws://localhost:2567';

/** The slice of `import.meta.env` the client reads. Passed in, so the rules can be tested without Vite. */
export interface BuildEnv {
  VITE_GAME_SERVER?: string;
  VITE_HIGHLIGHT_COVERS?: string;
  DEV: boolean;
}

/**
 * What the build declares, as Vite hands it over. This module is the only place the client reads
 * `import.meta.env`, so a scene that needs a build value asks for it here and never reaches for it
 * itself.
 */
export function buildEnv(): BuildEnv {
  return import.meta.env;
}

/**
 * The game server the client joins. A declared value must be a WebSocket URL; an undeclared one falls
 * back to the development server only under `vite dev`. Anywhere else it throws, so a build without
 * an endpoint fails at load instead of connecting to the player's own machine.
 */
export function gameServerEndpoint(env: BuildEnv): string {
  const declared = env.VITE_GAME_SERVER;

  if (declared === undefined || declared === '') {
    if (env.DEV) return DEV_GAME_SERVER;
    throw new Error('VITE_GAME_SERVER is not set: the build has no game server to join');
  }

  let protocol: string;
  try {
    protocol = new URL(declared).protocol;
  } catch {
    throw new Error(`VITE_GAME_SERVER is not a URL: ${declared}`);
  }
  if (protocol !== 'ws:' && protocol !== 'wss:') {
    throw new Error(`VITE_GAME_SERVER must be ws:// or wss://, got ${declared}`);
  }

  return declared;
}

/**
 * Whether the board starts with the marks of the rules drawn (ADR 0012). `VITE_HIGHLIGHT_COVERS` is
 * the build's answer — `1`/`true` for on, `0`/`false` for off — and a build that says nothing gets
 * `HIGHLIGHT_COVERS_DEFAULT`. Anything else throws, so a typo fails at load instead of quietly
 * shipping the wrong default.
 */
export function highlightCoversDefault(env: BuildEnv): boolean {
  const declared = env.VITE_HIGHLIGHT_COVERS;

  if (declared === undefined || declared === '') return HIGHLIGHT_COVERS_DEFAULT;
  if (declared === '1' || declared === 'true') return true;
  if (declared === '0' || declared === 'false') return false;

  throw new Error(`VITE_HIGHLIGHT_COVERS must be 1, true, 0 or false, got ${declared}`);
}
