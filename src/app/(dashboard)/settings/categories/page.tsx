import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { toCategoryRow } from './presentation/mappers/category.mapper';
import { CategoriesTablePage } from './presentation/components/CategoriesTablePage';

export default async function CategoriesPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, 'categories', 'read')) {
    redirect('/');
  }

  const canWrite = hasPermission(session.user.role, 'categories', 'create');

  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      parent: { select: { name: true } },
      _count: { select: { children: true, assets: true } },
    },
  });

  return (
    <CategoriesTablePage initialRows={categories.map(toCategoryRow)} canWrite={canWrite} />
  );
}
