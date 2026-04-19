import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listEmployeesAction } from './actions';
import { EmployeesTablePage } from './presentation/components/EmployeesTablePage';

type Role = Parameters<typeof hasPermission>[0];
type IsActiveParam = 'active' | 'inactive' | 'all';

function parseIsActive(v: string | undefined): IsActiveParam {
  return v === 'all' || v === 'inactive' ? v : 'active';
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    isActive?: string;
    q?: string;
  }>;
}) {
  const session = await auth();
  if (
    !session?.user ||
    !hasPermission(session.user.role as Role, 'employees', 'read')
  ) {
    redirect('/');
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const isActive = parseIsActive(sp.isActive);
  const q = sp.q?.trim() ?? '';

  const result = await listEmployeesAction({ page, pageSize, isActive, q });
  if (!result.ok) redirect('/');

  const canWrite = hasPermission(session.user.role as Role, 'employees', 'create');

  return (
    <EmployeesTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageCount={result.data.pageCount}
      canWrite={canWrite}
      currentPage={page}
      currentPageSize={pageSize}
      currentIsActive={isActive}
      currentQ={q}
    />
  );
}
