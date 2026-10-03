// Public entry point of the battle engine. The match server (M2) talks to the engine through this
// file alone: build a match, request actions, replay the events, read the public view, hash the result.
// Helpers stay inside the package so the server cannot couple to them.

export const ENGINE_VERSION = '0.0.0';

export type * from './types';
export { newMatch, applyAction, applyEvents, publicState, hashState } from './match';
