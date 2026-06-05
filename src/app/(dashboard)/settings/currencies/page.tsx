import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import { listCurrenciesAction, listExchangeRatesAction } from './actions';
import { CurrenciesTabs } from './presentation/components/CurrenciesTabs';

function parsePageSize(s?: string) {
  return Math.min(100, Math.max(5, Number(s ?? 20) || 20));
}

export default async function CurrenciesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    monedas_afterCursor?: string;
    monedas_beforeCursor?: string;
    monedas_pageSize?: string;
    monedas_q?: string;
    tasas_afterCursor?: string;
    tasas_beforeCursor?: string;
    tasas_pageSize?: string;
    tasas_q?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, 'currencies', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;

  const validTabs = ['monedas', 'tasas'] as const;
  const initialTab = validTabs.includes(sp.tab as (typeof validTabs)[number])
    ? (sp.tab as (typeof validTabs)[number])
    : 'monedas';

  const canWrite = hasPermission(session.user.role, 'currencies', 'create');

  const [currenciesRes, exchangeRatesRes] = await Promise.all([
    listCurrenciesAction({
      pageSize: parsePageSize(sp.monedas_pageSize),
      afterCursor: sp.monedas_afterCursor || undefined,
      beforeCursor: sp.monedas_beforeCursor || undefined,
      q: sp.monedas_q || undefined,
    }),
    listExchangeRatesAction({
      pageSize: parsePageSize(sp.tasas_pageSize),
      afterCursor: sp.tasas_afterCursor || undefined,
      beforeCursor: sp.tasas_beforeCursor || undefined,
      q: sp.tasas_q || undefined,
    }),
  ]);

  if (!currenciesRes.ok || !exchangeRatesRes.ok) redirect('/');

  return (
    <CurrenciesTabs
      initialTab={initialTab}
      canWrite={canWrite}
      currencies={currenciesRes.data}
      exchangeRates={exchangeRatesRes.data}
      currenciesQ={sp.monedas_q ?? ''}
      exchangeRatesQ={sp.tasas_q ?? ''}
    />
  );
}
