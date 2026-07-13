import { describe, expect, it } from 'vitest';
import { isAllowedDocumentType } from '../src/documents';

describe('politique des documents', () => {
  it('accepte uniquement les formats explicitement autorisés', () => {
    expect(isAllowedDocumentType('application/pdf')).toBe(true);
    expect(isAllowedDocumentType('image/png')).toBe(true);
    expect(isAllowedDocumentType('text/html')).toBe(false);
    expect(isAllowedDocumentType('application/x-msdownload')).toBe(false);
  });
});
