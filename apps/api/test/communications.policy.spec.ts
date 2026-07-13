import { describe, expect, it } from 'vitest';
import { canReadInternalNote, messageAuthorRole } from '../src/communications';

describe('visibilité des notes internes', () => {
  it('refuse les étudiants', () => expect(canReadInternalNote(false, false)).toBe(false));
  it('autorise le conseiller affecté et l’administrateur', () => {
    expect(canReadInternalNote(true, false)).toBe(true);
    expect(canReadInternalNote(false, true)).toBe(true);
  });
  it('identifie l’auteur d’un message partagé', () => {
    expect(messageAuthorRole('student-id', 'student-id', 'advisor-id')).toBe('STUDENT');
    expect(messageAuthorRole('advisor-id', 'student-id', 'advisor-id')).toBe('ADVISOR');
    expect(messageAuthorRole('admin-id', 'student-id', 'advisor-id')).toBe('ADMIN');
  });
});
