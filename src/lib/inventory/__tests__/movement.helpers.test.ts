// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Mock Prisma types — no real DB needed
// The helper accepts a Prisma.TransactionClient; we hand-roll a mock tx.
const makeMovement = () => ({
  id: 'mov-1',
  assetId: 'asset-1',
  fromLocationId: 'loc-1',
  fromBodegaId: 'bod-1',
  toLocationId: 'loc-2',
  toBodegaId: null,
  movementType: 'ASSIGNMENT_DELIVERY',
  reason: null,
  notes: null,
  movedById: 'user-1',
  movedAt: new Date('2025-06-01T00:00:00.000Z'),
  createdAt: new Date('2025-06-01T00:00:00.000Z'),
  updatedAt: new Date('2025-06-01T00:00:00.000Z'),
  asset: { assetCode: 'NVH-PC-00001', brand: 'Lenovo', model: 'ThinkPad X1' },
  fromLocation: { name: 'Sede Bogotá' },
  toLocation: { name: 'Sede Bogotá' },
  fromBodega: { name: 'Bodega A' },
  toBodega: null,
  movedBy: { name: 'Admin User' },
});

const makeMockTx = () => ({
  assetMovement: {
    create: vi.fn().mockResolvedValue(makeMovement()),
  },
  asset: {
    update: vi.fn().mockResolvedValue({}),
  },
});

// Dynamic import so RED phase fails with "cannot find module" if file absent
describe('createMovementInTx', () => {
  it('calls tx.assetMovement.create with correct fields', async () => {
    const { createMovementInTx } = await import('../movement.helpers');
    const tx = makeMockTx();

    await createMovementInTx(tx as never, {
      assetId: 'asset-1',
      fromLocationId: 'loc-1',
      fromBodegaId: 'bod-1',
      toLocationId: 'loc-2',
      toBodegaId: null,
      movementType: 'ASSIGNMENT_DELIVERY',
      movedById: 'user-1',
    });

    expect(tx.assetMovement.create).toHaveBeenCalledTimes(1);
    const createCall = tx.assetMovement.create.mock.calls[0][0];
    expect(createCall.data.assetId).toBe('asset-1');
    expect(createCall.data.toLocationId).toBe('loc-2');
    expect(createCall.data.toBodegaId).toBeNull();
    expect(createCall.data.movementType).toBe('ASSIGNMENT_DELIVERY');
    expect(createCall.data.movedById).toBe('user-1');
  });

  it('calls tx.asset.update with locationId and bodegaId', async () => {
    const { createMovementInTx } = await import('../movement.helpers');
    const tx = makeMockTx();

    await createMovementInTx(tx as never, {
      assetId: 'asset-1',
      toLocationId: 'loc-2',
      toBodegaId: 'bod-2',
      movementType: 'ASSIGNMENT_RETURN',
      movedById: 'user-1',
    });

    expect(tx.asset.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.asset.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'asset-1' });
    expect(updateCall.data.locationId).toBe('loc-2');
    expect(updateCall.data.bodegaId).toBe('bod-2');
  });

  it('sets bodegaId to null when toBodegaId is omitted', async () => {
    const { createMovementInTx } = await import('../movement.helpers');
    const tx = makeMockTx();

    await createMovementInTx(tx as never, {
      assetId: 'asset-1',
      toLocationId: 'loc-2',
      movementType: 'RELOCATION',
      movedById: 'user-1',
    });

    const updateCall = tx.asset.update.mock.calls[0][0];
    expect(updateCall.data.bodegaId).toBeNull();
  });

  it('returns the created movement', async () => {
    const { createMovementInTx } = await import('../movement.helpers');
    const tx = makeMockTx();
    const expectedMovement = makeMovement();
    tx.assetMovement.create.mockResolvedValue(expectedMovement);

    const result = await createMovementInTx(tx as never, {
      assetId: 'asset-1',
      toLocationId: 'loc-2',
      movementType: 'ASSIGNMENT_DELIVERY',
      movedById: 'user-1',
    });

    expect(result).toBe(expectedMovement);
  });

  it('passes movedById through to assetMovement.create', async () => {
    const { createMovementInTx } = await import('../movement.helpers');
    const tx = makeMockTx();

    await createMovementInTx(tx as never, {
      assetId: 'asset-1',
      toLocationId: 'loc-2',
      movementType: 'RELOCATION',
      movedById: 'specific-user-id',
    });

    const createCall = tx.assetMovement.create.mock.calls[0][0];
    expect(createCall.data.movedById).toBe('specific-user-id');
  });

  it('passes fromLocationId and fromBodegaId when provided', async () => {
    const { createMovementInTx } = await import('../movement.helpers');
    const tx = makeMockTx();

    await createMovementInTx(tx as never, {
      assetId: 'asset-1',
      fromLocationId: 'from-loc',
      fromBodegaId: 'from-bod',
      toLocationId: 'loc-2',
      movementType: 'RELOCATION',
      movedById: 'user-1',
    });

    const createCall = tx.assetMovement.create.mock.calls[0][0];
    expect(createCall.data.fromLocationId).toBe('from-loc');
    expect(createCall.data.fromBodegaId).toBe('from-bod');
  });
});
