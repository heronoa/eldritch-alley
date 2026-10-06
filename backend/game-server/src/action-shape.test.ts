import { describe, expect, it } from 'vitest';
import { isClientAction } from './action-shape';

describe('isClientAction', () => {
  it('accepts each of the four actions the protocol defines', () => {
    expect(isClientAction({ type: 'move', to: { x: 1, y: 2 } })).toBe(true);
    expect(isClientAction({ type: 'attack', target: 'B-sniper' })).toBe(true);
    expect(isClientAction({ type: 'reload' })).toBe(true);
    expect(isClientAction({ type: 'endTurn', round: 1 })).toBe(true);
  });

  it('refuses an endTurn that names no round, which the engine would read as a stale one', () => {
    expect(isClientAction({ type: 'endTurn' })).toBe(false);
    expect(isClientAction({ type: 'endTurn', round: 1.5 })).toBe(false);
    expect(isClientAction({ type: 'endTurn', round: '1' })).toBe(false);
  });

  it('refuses a move without a destination', () => {
    expect(isClientAction({ type: 'move' })).toBe(false);
    expect(isClientAction({ type: 'move', to: null })).toBe(false);
  });

  it('refuses a move whose coordinates are not whole numbers', () => {
    expect(isClientAction({ type: 'move', to: { x: 1.5, y: 0 } })).toBe(false);
    expect(isClientAction({ type: 'move', to: { x: Number.NaN, y: 0 } })).toBe(false);
  });

  it('refuses an attack without a string target', () => {
    expect(isClientAction({ type: 'attack' })).toBe(false);
    expect(isClientAction({ type: 'attack', target: 7 })).toBe(false);
  });

  it('refuses anything that is not an action at all', () => {
    expect(isClientAction(null)).toBe(false);
    expect(isClientAction(undefined)).toBe(false);
    expect(isClientAction('move')).toBe(false);
    expect(isClientAction({})).toBe(false);
    expect(isClientAction({ type: 'teleport' })).toBe(false);
  });

  it('ignores extra fields on an otherwise valid action', () => {
    expect(isClientAction({ type: 'reload', extra: 1 })).toBe(true);
  });
});
