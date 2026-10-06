// Public entry point of the battle engine. The match server (M2) talks to the engine through this
// file alone: build a match, request actions, replay the events, read the public view, hash the result.
// Helpers stay inside the package so the server cannot couple to them.

export const ENGINE_VERSION = '0.0.0';

export type * from './types';
export { newMatch, applyAction, applyEvents, publicState, hashState } from './match';
// Read by the client as well as the server, so the preview and the refusal use one rule (EA-1 D1).
export { hasLineOfSight } from './sight';
// The same, for movement: the client paints the cells the engine says a unit reaches (EA-2, EA-7).
export { findPath, reachableCells } from './movement';
// And the same for the area of a shot: the client paints the cells the engine says it covers (EA-5).
export { attackArea } from './attack';
// And the same for the whole turn: the client ends a turn nobody can use by itself (EA-4), and the
// question has to be the engine's so the two sides answer it alike.
export { canStillAct } from './actions';
