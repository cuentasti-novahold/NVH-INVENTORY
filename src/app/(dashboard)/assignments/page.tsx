import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listEmployeeAssignmentsAction } from './actions';
import { AssignmentsTablePage } from './presentation/components/AssignmentsTablePage';

type Role = Parameters<typeof hasPermission>[0];

export default async function AssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assignments', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const q = sp.q?.trim() ?? '';

  const result = await listEmployeeAssignmentsAction({ page, pageSize, q });
  if (!result.ok) redirect('/');

  const canWrite = hasPermission(session.user.role as Role, 'assignments', 'create');
  const canAdmin = hasPermission(session.user.role as Role, 'assignments', 'update');

  return (
    <AssignmentsTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageCount={result.data.pageCount}
      canWrite={canWrite}
      canAdmin={canAdmin}
      currentPage={page}
      currentPageSize={pageSize}
      currentQ={q}
    />
  );
}
