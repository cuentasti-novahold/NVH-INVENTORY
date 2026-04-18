import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  async function signInAction() {
    'use server';
    await signIn('microsoft-entra-id', { redirectTo: '/' });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8 shadow-sm">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Novahold Inventory
          </h1>
          <p className="text-sm text-muted-foreground">
            Inicia sesión con tu cuenta corporativa
          </p>
        </header>
        <form action={signInAction}>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Iniciar sesión con Microsoft
          </button>
        </form>
      </div>
    </main>
  );
}
