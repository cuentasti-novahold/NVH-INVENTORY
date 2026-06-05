import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listDepartmentsAction } from './actions';
import { DepartmentsTablePage } from './presentation/components/DepartmentsTablePage';

function parsePageSize(s?: string) {
  return Math.min(100, Math.max(5, Number(s ?? 20) || 20));
}

export default async function DepartmentsPage({
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
  if (!session?.user || !hasPermission(session.user.role, 'departments', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const canWrite = hasPermission(session.user.role, 'departments', 'create');

  const result = await listDepartmentsAction({
    pageSize: parsePageSize(sp.pageSize),
    afterCursor: sp.afterCursor || undefined,
    beforeCursor: sp.beforeCursor || undefined,
    q: sp.q || undefined,
  });

  if (!result.ok) redirect('/');

  return (
    <DepartmentsTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
      canWrite={canWrite}
      currentQ={sp.q ?? ''}
    />
  );
}
