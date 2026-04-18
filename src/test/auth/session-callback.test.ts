// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('next-auth/providers/microsoft-entra-id', () => ({
  default: vi.fn(() => ({ id: 'microsoft-entra-id', type: 'oauth' })),
}));

import { sessionCallback } from '@/auth';

describe('sessionCallback', () => {
  it('injects user.id and user.role into session', async () => {
    const session = {
      user: { email: 'u@novahold.com', name: 'Test' },
      expires: new Date().toISOString(),
    } as never;
    const user = { id: 'cuid_1', role: 'ADMIN' as const };
    const result = await sessionCallback({ session, user } as never);
    expect(result.user.id).toBe('cuid_1');
    expect(result.user.role).toBe('ADMIN');
  });

  it('returns session unchanged if session.user is missing', async () => {
    const session = { expires: new Date().toISOString() } as never;
    const user = { id: 'cuid_2', role: 'VIEWER' as const };
    const result = await sessionCallback({ session, user } as never);
    expect(result.user).toBeUndefined();
  });
});
