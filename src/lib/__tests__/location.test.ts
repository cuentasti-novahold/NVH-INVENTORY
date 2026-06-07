// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

import { locationHasBodegas } from '../location';

const makeMockClient = (count: number) => ({
  bodega: {
    count: vi.fn().mockResolvedValue(count),
  },
});

describe('locationHasBodegas', () => {
  it('returns true when location has 1 or more bodegas', async () => {
    const client = makeMockClient(3);
    const result = await locationHasBodegas(client as never, 'loc-1');
    expect(result).toBe(true);
    expect(client.bodega.count).toHaveBeenCalledWith({ where: { locationId: 'loc-1' } });
  });

  it('returns false when location has 0 bodegas', async () => {
    const client = makeMockClient(0);
    const result = await locationHasBodegas(client as never, 'loc-2');
    expect(result).toBe(false);
    expect(client.bodega.count).toHaveBeenCalledWith({ where: { locationId: 'loc-2' } });
  });

  it('returns true when count is exactly 1', async () => {
    const client = makeMockClient(1);
    const result = await locationHasBodegas(client as never, 'loc-3');
    expect(result).toBe(true);
  });
});
