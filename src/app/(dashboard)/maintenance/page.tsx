import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';
import { listMaintenancesAction } from './actions';
import { MaintenanceTablePage } from './presentation/components/MaintenanceTablePage';
import type { MaintenanceType } from './presentation/dto/maintenance.dto';

type Role = Parameters<typeof hasPermission>[0];
type TypeFilter = MaintenanceType | 'all';

const VALID_TYPES: string[] = ['REVISION', 'REPAIR', 'UPGRADE', 'CLEANING'];

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{
    afterCursor?: string;
    beforeCursor?: string;
    pageSize?: string;
    type?: string;
    assetId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'maintenance', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const afterCursor = sp.afterCursor || undefined;
  const beforeCursor = sp.beforeCursor || undefined;
  const currentType = (
    VALID_TYPES.includes(sp.type ?? '') ? sp.type : 'all'
  ) as TypeFilter;
  const assetId = sp.assetId?.trim() ?? '';

  const result = await listMaintenancesAction({
    pageSize,
    afterCursor,
    beforeCursor,
    type: currentType === 'all' ? undefined : currentType,
    assetId: assetId || undefined,
  });

  const initialData = result.ok
    ? result.data
    : { rows: [], rowCount: 0, pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: undefined, endCursor: undefined, limit: pageSize } };

  const canWrite = hasPermission(session.user.role as Role, 'maintenance', 'create');
  const canDelete = hasPermission(session.user.role as Role, 'maintenance', 'delete');

  return (
    <MaintenanceTablePage
      initialData={initialData}
      canWrite={canWrite}
      canDelete={canDelete}
      currentType={currentType}
    />
  );
}
