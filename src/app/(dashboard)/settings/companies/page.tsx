import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listCompaniesAction } from './actions';
import { CompaniesTablePage } from './presentation/components/CompaniesTablePage';

function parsePageSize(s?: string) {
  return Math.min(100, Math.max(5, Number(s ?? 20) || 20));
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    afterCursor?: string;
    beforeCursor?: string;
    pageSize?: string;
    q?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, 'companies', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const canWrite = hasPermission(session.user.role, 'companies', 'create');

  const result = await listCompaniesAction({
    pageSize: parsePageSize(sp.pageSize),
    afterCursor: sp.afterCursor || undefined,
    beforeCursor: sp.beforeCursor || undefined,
    q: sp.q || undefined,
  });

  if (!result.ok) redirect('/');

  return (
    <CompaniesTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
      paramPrefix="empresas"
      canWrite={canWrite}
      currentQ={sp.q ?? ''}
    />
  );
}
