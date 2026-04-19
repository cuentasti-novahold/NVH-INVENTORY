// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    category: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import {
  listCategoriesAction,
  searchCategoriesAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from '../actions';

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockCategory = prisma.category as {
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeSession(role: string) {
  return { user: { id: 'u1', role } };
}

const sampleCategory = {
  id: 'cat1',
  name: 'Computador',
  prefix: 'PC',
  description: null,
  defaultUsefulLife: 5,
  parentId: null,
  createdAt: new Date(),
  fieldConfig: null,
  parent: null,
  _count: { children: 0, assets: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listCategoriesAction', () => {
  it('allows VIEWER to list categories', async () => {
    mockAuth.mockResolvedValue(makeSession('VIEWER'));
    mockCategory.findMany.mockResolvedValue([sampleCategory]);
    const result = await listCategoriesAction();
    expect(result.ok).toBe(true);
  });

  it('returns FORBIDDEN when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await listCategoriesAction();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });
});

describe('createCategoryAction', () => {
  it('returns UNAUTHORIZED when auth() is null', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await createCategoryAction({ name: 'Test', prefix: 'TST' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHORIZED');
  });

  it('returns VALIDATION error with fieldErrors.prefix when prefix is lowercase', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    const result = await createCategoryAction({ name: 'Test', prefix: 'pc' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION');
      expect(result.fieldErrors?.prefix).toBeDefined();
    }
  });

  it('returns CONFLICT with fieldErrors.prefix when Prisma throws P2002 on prefix', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.create.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['prefix'] },
    });
    const result = await createCategoryAction({ name: 'Test', prefix: 'PC' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.fieldErrors?.prefix).toBeDefined();
    }
  });

  it('happy path: creates with sequence=0 and returns ok:true', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.create.mockResolvedValue(sampleCategory);
    const result = await createCategoryAction({ name: 'Test', prefix: 'PC' });
    expect(result.ok).toBe(true);
    const callArgs = mockCategory.create.mock.calls[0][0];
    expect(callArgs.data.sequence).toBe(0);
    expect(callArgs.data.sequence).not.toBeUndefined();
  });
});

// Valid UUIDs for cycle tests (RFC 4122 version 4)
const UUID_ROOT = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_CHILD_A = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_CHILD_B = 'c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f';

describe('updateCategoryAction', () => {
  it('returns IMMUTABLE when assets > 0 and prefix differs', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findUnique.mockResolvedValue({
      id: UUID_ROOT, parentId: null, prefix: 'PC',
      _count: { assets: 3 },
    });
    mockCategory.findMany.mockResolvedValue([]);
    const result = await updateCategoryAction(UUID_ROOT, { prefix: 'PC2' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('IMMUTABLE');
      expect(result.fieldErrors?.prefix).toBeDefined();
    }
  });

  it('returns CYCLE when dto.parentId === id', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findUnique.mockResolvedValue({
      id: UUID_ROOT, parentId: null, prefix: 'PC',
      _count: { assets: 0 },
    });
    mockCategory.findMany.mockResolvedValue([]);
    const result = await updateCategoryAction(UUID_ROOT, { parentId: UUID_ROOT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CYCLE');
  });

  it('returns CYCLE when parentId is a descendant', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findUnique.mockResolvedValue({
      id: UUID_ROOT, parentId: null, prefix: 'PC',
      _count: { assets: 0 },
    });
    // Build chain: root -> childA -> childB
    mockCategory.findMany.mockResolvedValue([
      { id: UUID_ROOT, parentId: null },
      { id: UUID_CHILD_A, parentId: UUID_ROOT },
      { id: UUID_CHILD_B, parentId: UUID_CHILD_A },
    ]);
    const result = await updateCategoryAction(UUID_ROOT, { parentId: UUID_CHILD_B });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CYCLE');
  });
});

describe('deleteCategoryAction', () => {
  it('returns HAS_CHILDREN when _count.children > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findUnique.mockResolvedValue({
      _count: { children: 2, assets: 0 },
    });
    const result = await deleteCategoryAction('cat1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });

  it('returns HAS_CHILDREN when _count.assets > 0', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findUnique.mockResolvedValue({
      _count: { children: 0, assets: 5 },
    });
    const result = await deleteCategoryAction('cat1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('HAS_CHILDREN');
  });

  it('happy path: calls delete and revalidatePath', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findUnique.mockResolvedValue({
      _count: { children: 0, assets: 0 },
    });
    mockCategory.delete.mockResolvedValue({});
    const result = await deleteCategoryAction('cat1');
    expect(result.ok).toBe(true);
    expect(mockCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat1' } });
    expect(revalidatePath).toHaveBeenCalledWith('/settings/categories');
  });
});

describe('searchCategoriesAction', () => {
  it('returns items shaped { code: id, value: "Name (PREFIX)" }', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    mockCategory.findMany.mockResolvedValue([
      { id: 'cat1', name: 'Computador', prefix: 'PC' },
    ]);
    const result = await searchCategoriesAction('comp');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data[0]).toEqual({ code: 'cat1', value: 'Computador (PC)' });
    }
  });

  it('excludes self + descendants when excludeId is passed', async () => {
    mockAuth.mockResolvedValue(makeSession('ADMIN'));
    // findMany called twice: once for descendants, once for search
    mockCategory.findMany
      .mockResolvedValueOnce([
        // all categories for DFS
        { id: 'root', parentId: null },
        { id: 'child1', parentId: 'root' },
        { id: 'other', parentId: null },
      ])
      .mockResolvedValueOnce([
        { id: 'other', name: 'Otro', prefix: 'OTH' },
      ]);

    const result = await searchCategoriesAction('test', 'root');
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The search call should have notIn filter
      const searchCall = mockCategory.findMany.mock.calls[1][0];
      expect(searchCall.where.id?.notIn).toBeDefined();
      expect(searchCall.where.id.notIn).toContain('root');
      expect(searchCall.where.id.notIn).toContain('child1');
    }
  });
});
