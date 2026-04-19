'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
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
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
} from 'lucide-react';

interface PageInfo {
  limit: number;
  page?: number;
  total?: number;
}

interface MainDataTableProps<T> {
  columns: ColumnDef<T>[];
  data?: T[];
  pageCount?: number;
  rowCount?: number;
  isLoading?: boolean;
  onPaginationChange?: (updater: (prev: PaginationState) => PaginationState) => void;
  paginationState?: PageInfo;
}

export function MainDataTable<T>({
  columns,
  data = [],
  pageCount = 1,
  rowCount,
  isLoading,
  onPaginationChange,
  paginationState,
}: MainDataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    pageCount,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    state: {
      pagination: {
        pageIndex: (paginationState?.page ?? 1) - 1,
        pageSize: paginationState?.limit ?? 10,
      },
    },
    onPaginationChange: (updater) => {
      if (typeof updater === 'function') {
        onPaginationChange?.((prev) => {
          const next = updater({ pageIndex: (prev as unknown as { page: number }).page - 1, pageSize: prev.limit });
          return { ...prev, page: next.pageIndex + 1, limit: next.pageSize };
        });
      }
    },
  });

  const currentPage = table.getState().pagination.pageIndex + 1;
  const showFooter = rowCount != null || pageCount > 1;

  return (
    <div className="rounded-lg border border-border overflow-hidden h-full flex flex-col">
      {/* Scrollable area — both axes */}
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

      {/* Fixed footer — stays visible while table scrolls */}
      {showFooter && (
        <div className="shrink-0 flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            {rowCount != null
              ? `${rowCount.toLocaleString('es-CO')} ${rowCount === 1 ? 'registro' : 'registros'}`
              : null}
          </p>

          {pageCount > 1 && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-3 min-w-[90px] text-center">
                Pág. {currentPage} / {pageCount}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => table.setPageIndex(pageCount - 1)}
                disabled={!table.getCanNextPage()}
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
