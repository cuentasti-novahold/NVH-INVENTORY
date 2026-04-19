import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/auth.config';
import type { UserRole } from '@/generated/prisma';
import type { Session, JWT } from 'next-auth';

const isDev = process.env.NODE_ENV === 'development';

// Handles both strategies:
// - database (prod): receives { session, user } from DB
// - jwt (dev):       receives { session, token } from JWT
export async function sessionCallback({
  session,
  user,
  token,
}: {
  session: Session;
  user?: { id: string; role: UserRole };
  token?: JWT & { role?: UserRole };
}) {
  if (session.user) {
    session.user.id = user?.id ?? token?.sub ?? '';
    session.user.role = user?.role ?? token?.role ?? 'VIEWER';
  }
  return session;
}

const devProviders = isDev
  ? [
      Credentials({
        id: 'dev',
        name: 'Desarrollo',
        credentials: {},
        authorize: () => ({
          id: 'user-admin',
          email: 'admin@novahold.com',
          name: 'Administrador Principal',
          role: 'SUPER_ADMIN' as UserRole,
        }),
      }),
    ]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Adapter only in production — credentials provider doesn't work with DB sessions
  ...(!isDev && {
    // @auth/prisma-adapter types against @prisma/client default path.
    // Prisma 7 custom output (src/generated/prisma) — cast is safe at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapter: PrismaAdapter(prisma as any),
  }),
  session: { strategy: isDev ? 'jwt' : 'database' },
  providers: [...authConfig.providers, ...devProviders],
  callbacks: {
    ...authConfig.callbacks,
    session: sessionCallback as never,
    ...(isDev && {
      jwt({ token, user }: { token: JWT; user?: { role: UserRole } }) {
        if (user?.role) token.role = user.role;
        return token;
      },
    }),
  },
});
