import { describe, expect, it } from 'vitest';
import { canDeleteSharedContent, canDeleteSharedMessage, canReadInternalNote, messageAuthorRole } from '../src/communications';

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
  it('réserve la suppression d’une synthèse au conseiller qui l’a publiée', () => {
    expect(canDeleteSharedContent(true, 'advisor-id', 'advisor-id')).toBe(true);
    expect(canDeleteSharedContent(true, 'other-advisor-id', 'advisor-id')).toBe(false);
    expect(canDeleteSharedContent(false, 'student-id', 'student-id')).toBe(false);
  });
  it('réserve la suppression d’un message au conseiller qui l’a envoyé', () => {
    expect(canDeleteSharedMessage(true, 'advisor-id', 'advisor-id')).toBe(true);
    expect(canDeleteSharedMessage(true, 'student-id', 'advisor-id')).toBe(false);
    expect(canDeleteSharedMessage(false, 'student-id', 'student-id')).toBe(false);
  });
});
