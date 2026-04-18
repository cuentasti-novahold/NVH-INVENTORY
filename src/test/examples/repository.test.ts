// @vitest-environment node

import { vi } from 'vitest';

/**
 * Example: infrastructure (repository) test with mocked Prisma.
 * Pattern: infrastructure layer — node environment, mocked DB client.
 * Copy this structure for tests under src/modules/<m>/infrastructure/**.
 *
 * Key ideas:
 *  - Mock @/lib/prisma via vi.mock so the repository sees a controlled client.
 *  - Assert the Prisma method was called with the expected arguments.
 *  - NEVER hit a real database in this layer of tests — that is the job
 *    of the future `testing-db-integration` change.
 */

vi.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// @ts-ignore — @/lib/prisma doesn't exist yet; vi.mock() above supplies the module at test runtime.
import { prisma } from '@/lib/prisma';

interface AssetRecord {
  id: string;
  assetCode: string;
}

interface IAssetRepository {
  findByCode(code: string): Promise<AssetRecord | null>;
}

class PrismaAssetRepository implements IAssetRepository {
  async findByCode(code: string): Promise<AssetRecord | null> {
    const row = await prisma.asset.findUnique({ where: { assetCode: code } });
    return row as AssetRecord | null;
  }
}

describe('PrismaAssetRepository.findByCode', () => {
  beforeEach(() => {
    vi.mocked(prisma.asset.findUnique).mockReset();
  });

  it('returns the asset when prisma resolves a row', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      id: 'a1',
      assetCode: 'NVH-PC-00001',
    } as never);

    const repo = new PrismaAssetRepository();
    const result = await repo.findByCode('NVH-PC-00001');

    expect(prisma.asset.findUnique).toHaveBeenCalledWith({
      where: { assetCode: 'NVH-PC-00001' },
    });
    expect(result).toEqual({ id: 'a1', assetCode: 'NVH-PC-00001' });
  });

  it('returns null when prisma resolves null', async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null);

    const repo = new PrismaAssetRepository();
    const result = await repo.findByCode('NVH-PC-99999');

    expect(result).toBeNull();
  });
});
