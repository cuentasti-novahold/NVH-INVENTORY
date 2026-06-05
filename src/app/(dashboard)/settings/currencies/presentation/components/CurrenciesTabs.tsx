'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Coins, TrendingUp } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CurrenciesTablePage } from './CurrenciesTablePage';
import { ExchangeRatesTablePage } from './ExchangeRatesTablePage';
import type { CurrencyRow } from '../dto/currency.dto';
import type { ExchangeRateRow } from '../dto/exchange-rate.dto';
import type { PageInfo } from '@/shared/types/pagination';

interface TabBundle<TRow> {
  rows: TRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

const TAB_CONFIG = [
  { value: 'monedas', label: 'Monedas', icon: Coins },
  { value: 'tasas', label: 'Tasas de cambio', icon: TrendingUp },
] as const;

export function CurrenciesTabs({
  initialTab,
  canWrite,
  currencies,
  exchangeRates,
  currenciesQ,
  exchangeRatesQ,
}: {
  initialTab: string;
  canWrite: boolean;
  currencies: TabBundle<CurrencyRow>;
  exchangeRates: TabBundle<ExchangeRateRow>;
  currenciesQ: string;
  exchangeRatesQ: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();

  function onChange(v: string) {
    const params = new URLSearchParams(sp.toString());
    params.set('tab', v);
    start(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Coins className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Monedas</h1>
          <p className="text-sm text-muted-foreground">Monedas y tasas de cambio</p>
        </div>
      </div>

      <Tabs value={initialTab} onValueChange={onChange}>
        <div className="border-b border-border">
          <TabsList variant="line" className="h-auto w-fit gap-0 pb-0">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-2 rounded-none px-4 pb-3 pt-1 text-sm font-medium after:bg-accent"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="monedas" className="mt-4">
          <CurrenciesTablePage
            initialRows={currencies.rows}
            rowCount={currencies.rowCount}
            pageInfo={currencies.pageInfo}
            paramPrefix="monedas"
            canWrite={canWrite}
            currentQ={currenciesQ}
          />
        </TabsContent>
        <TabsContent value="tasas" className="mt-4">
          <ExchangeRatesTablePage
            initialRows={exchangeRates.rows}
            rowCount={exchangeRates.rowCount}
            pageInfo={exchangeRates.pageInfo}
            paramPrefix="tasas"
            canWrite={canWrite}
            currentQ={exchangeRatesQ}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
