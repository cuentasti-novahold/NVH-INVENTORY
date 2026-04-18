import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/auth.config';
import type { UserRole } from '@/generated/prisma';
import type { Session } from 'next-auth';

export async function sessionCallback({
  session,
  user,
}: {
  session: Session;
  user: { id: string; role: UserRole };
}) {
  if (session.user) {
    session.user.id = user.id;
    session.user.role = user.role;
  }
  return session;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // @auth/prisma-adapter types against @prisma/client default path.
  // Prisma 7 uses custom output (src/generated/prisma) — cast is safe at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  callbacks: {
    ...authConfig.callbacks,
    session: sessionCallback,
  },
});
