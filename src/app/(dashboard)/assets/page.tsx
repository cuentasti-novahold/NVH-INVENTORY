import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listAssetsAction } from './actions';
import { AssetsTablePage } from './presentation/components/AssetsTablePage';

type Role = Parameters<typeof hasPermission>[0];
type IsActiveParam = 'active' | 'inactive' | 'all';

function parseIsActive(v: string | undefined): IsActiveParam {
  return v === 'all' || v === 'inactive' ? v : 'active';
}

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    isActive?: string;
    q?: string;
    categoryId?: string;
    generalStatus?: string;
    locationId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const isActive = parseIsActive(sp.isActive);
  const q = sp.q?.trim() ?? '';

  const result = await listAssetsAction({
    page,
    pageSize,
    isActive,
    q,
    categoryId: sp.categoryId,
    generalStatus: sp.generalStatus,
    locationId: sp.locationId,
  });
  if (!result.ok) redirect('/');

  const canWrite = hasPermission(session.user.role as Role, 'assets', 'create');

  return (
    <AssetsTablePage
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
