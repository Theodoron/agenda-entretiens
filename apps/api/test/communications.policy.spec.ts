import { describe, expect, it } from 'vitest';
import { canReadInternalNote } from '../src/communications';

describe('visibilité des notes internes', () => {
  it('refuse les étudiants', () => expect(canReadInternalNote(false, false)).toBe(false));
  it('autorise le conseiller affecté et l’administrateur', () => {
    expect(canReadInternalNote(true, false)).toBe(true);
    expect(canReadInternalNote(false, true)).toBe(true);
  });
});
