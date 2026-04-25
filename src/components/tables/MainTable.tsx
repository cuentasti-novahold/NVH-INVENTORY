'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { PageInfo } from '@/shared/types/pagination';

interface MainDataTableProps<T> {
  columns: ColumnDef<T>[];
  data?: T[];
  rowCount?: number;
  isLoading?: boolean;
  pageInfo?: PageInfo;
  onNextPage?: () => void;
  onPrevPage?: () => void;
}

export function MainDataTable<T>({
  columns,
  data = [],
  rowCount,
  isLoading,
  pageInfo,
  onNextPage,
  onPrevPage,
}: MainDataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const showFooter = rowCount != null || pageInfo != null;

  return (
    <div className="rounded-lg border border-border overflow-hidden h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => (
                <TableRow key={i} className="hover:bg-transparent">
                  {Array.from({ length: columns.length }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length}>
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <Inbox className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Sin resultados</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No hay registros que coincidan con los filtros aplicados
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showFooter && (
        <div className="shrink-0 flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {rowCount != null
              ? `${rowCount.toLocaleString('es-CO')} ${rowCount === 1 ? 'registro' : 'registros'}`
              : null}
          </p>

          {pageInfo && (onNextPage || onPrevPage) && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onPrevPage}
                disabled={!pageInfo.hasPreviousPage}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onNextPage}
                disabled={!pageInfo.hasNextPage}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
