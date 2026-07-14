import { describe, expect, it } from 'vitest';
import { requiredSecret } from '../src/configuration';

describe('configuration sensible', () => {
  it('refuse un secret absent ou trop court', () => {
    expect(() => requiredSecret('SESSION_SECRET', {})).toThrow('au moins 32 caractères');
    expect(() => requiredSecret('SESSION_SECRET', { SESSION_SECRET: 'trop-court' })).toThrow('au moins 32 caractères');
  });

  it('accepte un secret suffisamment long', () => {
    const secret = 'un-secret-de-session-avec-plus-de-32-caracteres';
    expect(requiredSecret('SESSION_SECRET', { SESSION_SECRET: secret })).toBe(secret);
  });
});
