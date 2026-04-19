import type { NextAuthConfig } from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

export const authConfig: NextAuthConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith('/login');
      const isOnApiAuth = nextUrl.pathname.startsWith('/api/auth');
      const isOnDashboard =
        !isOnLogin && !isOnApiAuth && !nextUrl.pathname.startsWith('/_next');

      if (isOnDashboard) return isLoggedIn;
      if (isLoggedIn && isOnLogin) return Response.redirect(new URL('/', nextUrl));
      return true;
    },
    async signIn({ account, profile }) {
      if (account?.provider === 'dev') {
        return process.env.NODE_ENV === 'development';
      }
      if (account?.provider === 'microsoft-entra-id') {
        const email =
          profile?.email ??
          (profile as { preferred_username?: string } | undefined)
            ?.preferred_username;
        return (
          typeof email === 'string' &&
          email.toLowerCase().endsWith('@novahold.com')
        );
      }
      return false;
    },
  },
  trustHost: true,
};
