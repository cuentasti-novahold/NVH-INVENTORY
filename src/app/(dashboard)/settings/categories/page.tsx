import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listCategoriesAction } from './actions';
import { CategoriesTablePage } from './presentation/components/CategoriesTablePage';

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ afterCursor?: string; beforeCursor?: string; pageSize?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, 'categories', 'read')) {
    redirect('/');
  }

  const canWrite = hasPermission(session.user.role, 'categories', 'create');

  const sp = await searchParams;
  const pageSize = Math.min(100, Math.max(5, Number(sp.pageSize ?? 20) || 20));
  const afterCursor = sp.afterCursor || undefined;
  const beforeCursor = sp.beforeCursor || undefined;
  const q = sp.q?.trim() ?? '';

  const result = await listCategoriesAction({ pageSize, afterCursor, beforeCursor, q });
  if (!result.ok) redirect('/');

  return (
    <CategoriesTablePage
      initialRows={result.data.rows}
      rowCount={result.data.rowCount}
      pageInfo={result.data.pageInfo}
      currentPageSize={pageSize}
      currentQ={q}
      canWrite={canWrite}
    />
  );
}
