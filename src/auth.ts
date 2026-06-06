import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import { authConfig } from '@/auth.config';
import type { UserRole } from '@/generated/prisma';
import type { Session } from 'next-auth';
import type { JWT } from 'next-auth/jwt';

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
  session: { strategy: 'jwt' },
  providers: [...authConfig.providers, ...devProviders],
  callbacks: {
    ...authConfig.callbacks,
    session: sessionCallback as never,
    async jwt({ token, user, trigger }: {
      token: JWT & { role?: UserRole };
      user?: { role?: UserRole };
      trigger?: 'signIn' | 'signUp' | 'update';
    }) {
      // VERIFIED: token.email is populated by NextAuth v5 MicrosoftEntraID from
      // the OIDC email claim (stable Entra identifier). Using it as the DB lookup
      // key per ADR-1. token.sub is the Entra OID and does not equal User.id under
      // the JWT strategy with PrismaAdapter.
      //
      // First sign-in: NextAuth passes `user` once. Trust the role mapped there.
      if (user?.role) {
        token.role = user.role;
        return token;
      }
      // Re-hydrate from DB when role is missing (the first-login VIEWER pin)
      // or when the session was explicitly updated (admin changed the role).
      if (!token.role || trigger === 'update') {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { email: token.email ?? '' },
            select: { role: true },
          });
          token.role = dbUser?.role ?? 'VIEWER';
        } catch {
          // Never hard-fail auth on a DB hiccup: keep existing role, else least-privilege.
          token.role = token.role ?? 'VIEWER';
        }
      }
      return token;
    },
  },
});
