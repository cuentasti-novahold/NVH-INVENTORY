import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listUsersAction } from './actions';
import { UsersTablePage } from './presentation/components/UsersTablePage';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ afterCursor?: string; beforeCursor?: string; pageSize?: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
    redirect('/');
  }

  const sp = await searchParams;
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const afterCursor = sp.afterCursor || undefined;
  const beforeCursor = sp.beforeCursor || undefined;

  const result = await listUsersAction({ pageSize, afterCursor, beforeCursor });
  if (!result.ok) redirect('/');

  return (
    <UsersTablePage
      users={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
    />
  );
}
