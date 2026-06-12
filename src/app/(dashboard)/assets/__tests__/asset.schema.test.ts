// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildAssetCreateSchema } from '../presentation/schemas/asset.schema';

describe('buildAssetCreateSchema — locationId', () => {
  it('rejects null locationId with required error', async () => {
    const schema = buildAssetCreateSchema();
    await expect(
      schema.validate({ companyId: 'cmp-1', categoryId: 'cat-1', locationId: null }, { abortEarly: true }),
    ).rejects.toThrow('La sede es obligatoria');
  });

  it('rejects empty string locationId with required error', async () => {
    const schema = buildAssetCreateSchema();
    await expect(
      schema.validate({ companyId: 'cmp-1', categoryId: 'cat-1', locationId: '' }, { abortEarly: true }),
    ).rejects.toThrow('La sede es obligatoria');
  });

  it('accepts a valid locationId string', async () => {
    const schema = buildAssetCreateSchema();
    const result = await schema.validate(
      { companyId: 'cmp-1', categoryId: 'cat-1', locationId: 'loc-abc' },
      { abortEarly: false },
    );
    expect((result as { locationId: string }).locationId).toBe('loc-abc');
  });
});
