import { describe, expect, it, vi } from 'vitest';
import { ReferencesController } from '../src/references';

describe('référentiels du profil', () => {
  it('masque les diplômes des composantes désactivées', async () => {
    const degreeFindMany = vi.fn().mockResolvedValue([]);
    const controller = new ReferencesController({
      component: { findMany: vi.fn().mockResolvedValue([]) },
      degree: { findMany: degreeFindMany },
      academicYear: { findMany: vi.fn().mockResolvedValue([]) },
    } as never);

    await controller.profileOptions({ session: { userId: 'admin-1' } } as never);

    expect(degreeFindMany).toHaveBeenCalledWith({
      where: { component: { active: true } },
      orderBy: { name: 'asc' },
    });
  });
});
