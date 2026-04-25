import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listMovementsAction } from './actions';
import { MovimientosTablePage } from './presentation/components/MovimientosTablePage';

type Role = Parameters<typeof hasPermission>[0];
type TypeFilter = 'RELOCATION' | 'LOAN' | 'REPAIR' | 'RETURN_FROM_REPAIR' | 'AUDIT' | 'all';

const VALID_TYPES = ['RELOCATION', 'LOAN', 'REPAIR', 'RETURN_FROM_REPAIR', 'AUDIT'];

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{
    afterCursor?: string;
    beforeCursor?: string;
    pageSize?: string;
    movementType?: string;
    assetId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'movements', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const afterCursor = sp.afterCursor || undefined;
  const beforeCursor = sp.beforeCursor || undefined;
  const movementType = (
    VALID_TYPES.includes(sp.movementType ?? '') ? sp.movementType : 'all'
  ) as TypeFilter;
  const assetId = sp.assetId?.trim() ?? '';

  const result = await listMovementsAction({
    pageSize,
    afterCursor,
    beforeCursor,
    movementType: movementType === 'all' ? undefined : movementType,
    assetId: assetId || undefined,
  });
  if (!result.ok) redirect('/');

  const canWrite = hasPermission(session.user.role as Role, 'movements', 'create');
  const canDelete = hasPermission(session.user.role as Role, 'movements', 'delete');

  const kardexLabel = assetId && result.data.rows[0]
    ? `${result.data.rows[0].assetCode} — ${result.data.rows[0].assetLabel}`
    : undefined;

  return (
    <MovimientosTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
      canWrite={canWrite}
      canDelete={canDelete}
      currentPageSize={pageSize}
      currentType={movementType}
      currentAssetId={assetId || undefined}
      currentAssetLabel={kardexLabel}
    />
  );
}
