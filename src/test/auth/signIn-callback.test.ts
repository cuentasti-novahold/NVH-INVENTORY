// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// Mock the Microsoft Entra ID provider to avoid real provider initialization
vi.mock('next-auth/providers/microsoft-entra-id', () => ({
  default: vi.fn(() => ({ id: 'microsoft-entra-id', type: 'oauth' })),
}));

import { authConfig } from '@/auth.config';

describe('authConfig signIn callback', () => {
  const signInFn = authConfig.callbacks!.signIn!;

  it('allows @novahold.com via profile.email', async () => {
    const result = await signInFn({
      account: { provider: 'microsoft-entra-id' } as never,
      profile: { email: 'user@novahold.com' } as never,
      user: {} as never,
    });
    expect(result).toBe(true);
  });

  it('allows @novahold.com via preferred_username', async () => {
    const result = await signInFn({
      account: { provider: 'microsoft-entra-id' } as never,
      profile: { preferred_username: 'user@novahold.com' } as never,
      user: {} as never,
    });
    expect(result).toBe(true);
  });

  it('rejects non-novahold domain', async () => {
    const result = await signInFn({
      account: { provider: 'microsoft-entra-id' } as never,
      profile: { email: 'user@gmail.com' } as never,
      user: {} as never,
    });
    expect(result).toBe(false);
  });

  it('rejects when email is undefined', async () => {
    const result = await signInFn({
      account: { provider: 'microsoft-entra-id' } as never,
      profile: {} as never,
      user: {} as never,
    });
    expect(result).toBe(false);
  });

  it('rejects non-azure providers', async () => {
    const result = await signInFn({
      account: { provider: 'github' } as never,
      profile: { email: 'user@novahold.com' } as never,
      user: {} as never,
    });
    expect(result).toBe(false);
  });
});
