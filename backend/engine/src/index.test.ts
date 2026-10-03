import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './index';

describe('engine', () => {
  it('exposes the version', () => {
    expect(ENGINE_VERSION).toBe('0.0.0');
  });
});
