// The client's reading of a refused join: which failure a caught value describes. The room's own
// refusal is a string the client does not own, so it is pinned here by its exact text.
import { describe, expect, it } from 'vitest';
import { joinFailure } from './join-failure';

describe('joinFailure', () => {
  it("reads the room's own refusal as an occupied seat", () => {
    expect(joinFailure(new Error('room full'))).toBe('occupied');
  });

  it('reads every other error as the server being unavailable', () => {
    expect(joinFailure(new Error('seat reservation expired.'))).toBe('unavailable');
    expect(joinFailure(new Error('Failed to fetch'))).toBe('unavailable');
    expect(joinFailure(new Error(''))).toBe('unavailable');
  });

  it('reads a value that is not an error at all, and never throws', () => {
    expect(joinFailure(null)).toBe('unavailable');
    expect(joinFailure(undefined)).toBe('unavailable');
    expect(joinFailure('room full')).toBe('unavailable');
    expect(joinFailure({ message: 'room full' })).toBe('unavailable');
  });
});
