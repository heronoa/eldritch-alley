import { describe, expect, it } from 'vitest';
import { readPort } from './config';

describe('readPort', () => {
  it('uses the fallback when the variable is not set', () => {
    expect(readPort(undefined, 2567)).toBe(2567);
    expect(readPort('', 2567)).toBe(2567);
  });

  it('reads a port from the variable', () => {
    expect(readPort('8080', 2567)).toBe(8080);
  });

  it('rejects values that are not a port', () => {
    expect(() => readPort('abc', 2567)).toThrow(/between 1 and 65535, got abc/);
    expect(() => readPort('0', 2567)).toThrow(/between 1 and 65535/);
    expect(() => readPort('65536', 2567)).toThrow(/between 1 and 65535/);
    expect(() => readPort('25.5', 2567)).toThrow(/between 1 and 65535/);
  });
});
