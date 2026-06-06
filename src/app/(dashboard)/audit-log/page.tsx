import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/permissions';
import { listAuditLogsAction } from './actions';
import { AuditLogTablePage } from './presentation/components/AuditLogTablePage';

type Role = Parameters<typeof hasPermission>[0];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    limit?: string;
    entity?: string;
    action?: string;
    search?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'auditLogs', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;
  const limit = Math.min(100, Math.max(5, Number(sp.limit ?? 20) || 20));

  const result = await listAuditLogsAction({
    cursor: sp.cursor || undefined,
    limit,
    entity: sp.entity || undefined,
    action: sp.action || undefined,
    search: sp.search?.trim() || undefined,
  });

  const initialData = result.ok
    ? result.data
    : {
        rows: [],
        rowCount: 0,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: undefined,
          endCursor: undefined,
          limit,
        },
      };

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Registro de Auditoría</h1>
        <p className="text-sm text-muted-foreground">
          Historial de cambios realizados sobre activos, empleados y configuración del sistema
        </p>
      </div>
      <AuditLogTablePage initialData={initialData} />
    </div>
  );
}
