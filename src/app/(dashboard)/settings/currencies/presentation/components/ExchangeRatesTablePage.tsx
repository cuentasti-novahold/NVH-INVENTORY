'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Plus, TrendingUp } from 'lucide-react';
import { MainDataTable } from '@/components/tables/MainTable';
import { TablePageToolbar } from '@/components/dashboard/TablePageToolbar';
import { Show } from '@/components/show/Show.component';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { exchangeRatesColumns } from './columns-exchange-rates';
import { exchangeRateFormConfig } from '../forms/exchange-rate-form.config';
import { useExchangeRates } from '../hooks/use-exchange-rates';
import type { ExchangeRateRow } from '../dto/exchange-rate.dto';
import type { PageInfo } from '@/shared/types/pagination';

const CREATE_DEFAULTS = {
  currencyId: '',
  rateToBase: '',
  effectiveDate: new Date().toISOString().split('T')[0],
  source: '',
};

export function ExchangeRatesTablePage({
  initialRows,
  rowCount,
  pageInfo,
  paramPrefix,
  canWrite,
  currentQ,
}: {
  initialRows: ExchangeRateRow[];
  rowCount: number;
  pageInfo: PageInfo;
  paramPrefix: string;
  canWrite: boolean;
  currentQ?: string;
}) {
  const [uiState, setUiState] = useState<{ createOpen: boolean }>({ createOpen: false });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pending, create } = useExchangeRates();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      const key = `${paramPrefix}_${k}`;
      if (v === null || v === '') next.delete(key);
      else next.set(key, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <TablePageToolbar
        config={{
          search: {
            value: currentQ ?? '',
            onChange: (q) =>
              updateParams({ q: q.trim() || null, afterCursor: null, beforeCursor: null }),
            placeholder: 'Buscar por moneda…',
          },
          actions: canWrite
            ? [
                {
                  label: 'Nueva tasa',
                  icon: <Plus className="h-3.5 w-3.5" />,
                  onClick: () => setUiState({ createOpen: true }),
                },
              ]
            : undefined,
        }}
      />

      <Show
        when={rowCount > 0}
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <TrendingUp className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">Sin tasas de cambio</p>
            <p className="mt-1 text-xs">No hay tasas de cambio registradas.</p>
          </div>
        }
      >
        <MainDataTable
          columns={exchangeRatesColumns}
          data={initialRows}
          rowCount={rowCount}
          pageInfo={pageInfo}
          onNextPage={() =>
            updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null })
          }
          onPrevPage={() =>
            updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null })
          }
        />
      </Show>

      <CrudFormDialog
        open={uiState.createOpen}
        onOpenChange={(o) => setUiState({ createOpen: o })}
        title="Nueva tasa de cambio"
        formConfig={exchangeRateFormConfig}
        defaultValues={CREATE_DEFAULTS}
        isLoading={pending}
        onSubmit={(data) =>
          create(data as never, () => setUiState({ createOpen: false }))
        }
      />
    </div>
  );
}
