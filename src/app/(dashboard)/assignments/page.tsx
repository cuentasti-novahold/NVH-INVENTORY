import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listEmployeeAssignmentsAction } from './actions';
import { AssignmentsTablePage } from './presentation/components/AssignmentsTablePage';

type Role = Parameters<typeof hasPermission>[0];

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    afterCursor?: string;
    beforeCursor?: string;
    pageSize?: string;
    q?: string;
    status?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const afterCursor = sp.afterCursor || undefined;
  const beforeCursor = sp.beforeCursor || undefined;
  const q = sp.q?.trim() ?? '';
  const currentStatus = (['ACTIVE', 'RETURNED', 'TRANSFERRED'].includes(sp.status ?? '')
    ? (sp.status as 'ACTIVE' | 'RETURNED' | 'TRANSFERRED')
    : 'all') as 'ACTIVE' | 'RETURNED' | 'TRANSFERRED' | 'all';

  const result = await listEmployeeAssignmentsAction({ pageSize, afterCursor, beforeCursor, q, status: currentStatus });
  if (!result.ok) redirect('/');

  const canWrite = hasPermission(session.user.role as Role, 'assignments', 'create');
  const canAdmin = hasPermission(session.user.role as Role, 'assignments', 'update');

  return (
    <AssignmentsTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
      canWrite={canWrite}
      canAdmin={canAdmin}
      currentPageSize={pageSize}
      currentQ={q}
      currentStatus={currentStatus}
    />
  );
}
