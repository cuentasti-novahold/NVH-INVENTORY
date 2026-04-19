import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { getAssetDetailAction } from '../actions';
import { AssetDetailView } from './presentation/AssetDetailView';

type Role = Parameters<typeof hasPermission>[0];

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetCode: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, 'assets', 'read')) {
    redirect('/');
  }

  const { assetCode } = await params;
  const result = await getAssetDetailAction(assetCode);

  if (!result.ok) notFound();

  return <AssetDetailView asset={result.data} />;
}
