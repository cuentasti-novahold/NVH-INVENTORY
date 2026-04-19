import { redirect } from 'next/navigation';
import { Toaster } from 'sonner';
import { auth } from '@/auth';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { MobileTopBar } from '@/components/dashboard/MobileTopBar';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { SidebarProvider } from '@/components/dashboard/sidebar-context';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardSidebar
          user={{
            id: session.user.id ?? '',
            name: session.user.name ?? null,
            email: session.user.email ?? '',
            image: session.user.image ?? null,
            role: session.user.role,
          }}
        />
        <main className="flex-1 overflow-hidden flex flex-col border-l border-sidebar-border">
          <MobileTopBar />
          <PageTransition>{children}</PageTransition>
        </main>
        <Toaster richColors position="top-right" />
      </div>
    </SidebarProvider>
  );
}
