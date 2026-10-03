import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './index';

describe('engine', () => {
  it('expõe a versão', () => {
    expect(ENGINE_VERSION).toBe('0.0.0');
  });
});
