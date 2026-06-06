'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MainDataTable } from '@/components/tables/MainTable';
import { Show } from '@/components/show/Show.component';
import { TableSkeleton } from '@/components/tables/TableSkeleton';
import { updateUserRole } from '../../actions';
import type { UserRow } from '../../actions';
import type { PageInfo } from '@/shared/types/pagination';

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER';

interface UsersTablePageProps {
  users: UserRow[];
  rowCount: number;
  pageInfo: PageInfo;
}

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];

const ROLE_VARIANT: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  SUPER_ADMIN: 'default',
  ADMIN: 'default',
  MANAGER: 'secondary',
  TECHNICIAN: 'secondary',
  VIEWER: 'outline',
};

export function UsersTablePage({
  users,
  rowCount,
  pageInfo,
}: UsersTablePageProps) {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(patch: Record<string, string | number | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function onChangeRole(userId: string, newRole: UserRole) {
    setPendingId(userId);
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole);
      if (result.ok) {
        toast.success('Rol actualizado correctamente');
      } else {
        toast.error(result.message ?? 'Error al actualizar el rol');
      }
      setPendingId(null);
    });
  }

  const columns: ColumnDef<UserRow>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => row.getValue('name') ?? '—',
    },
    {
      accessorKey: 'email',
      header: 'Email',
    },
    {
      accessorKey: 'role',
      header: 'Rol',
      cell: ({ row }) => (
        <Badge variant={ROLE_VARIANT[row.getValue('role') as UserRole]}>
          {row.getValue('role')}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Creado',
      cell: ({ row }) =>
        new Date(row.getValue('createdAt')).toLocaleDateString('es-CO'),
    },
    {
      id: 'actions',
      header: 'Cambiar Rol',
      cell: ({ row }) => (
        <Select
          defaultValue={row.original.role}
          disabled={pending && pendingId === row.original.id}
          onValueChange={(v) => onChangeRole(row.original.id, v as UserRole)}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-hidden">
      <div className="flex flex-col gap-0">
        <h1 className="text-lg font-semibold tracking-tight">Usuarios</h1>
        <p className="text-xs text-muted-foreground">
          Gestión de roles del sistema
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <Show when={rowCount > 0} fallback={<TableSkeleton columns={5} />}>
          <MainDataTable
            columns={columns}
            data={users}
            rowCount={rowCount}
            pageInfo={pageInfo}
            onNextPage={() => updateParams({ afterCursor: pageInfo.endCursor ?? null, beforeCursor: null })}
            onPrevPage={() => updateParams({ beforeCursor: pageInfo.startCursor ?? null, afterCursor: null })}
          />
        </Show>
      </div>
    </div>
  );
}
