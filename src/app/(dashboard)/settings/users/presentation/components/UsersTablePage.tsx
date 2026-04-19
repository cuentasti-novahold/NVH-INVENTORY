'use client';

import { useState, useTransition } from 'react';
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
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Show } from '@/components/show/Show.component';
import { TableSkeleton } from '@/components/tables/TableSkeleton';
import { updateUserRole } from '../../actions';

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'TECHNICIAN' | 'VIEWER';

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: string;
}

const ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'VIEWER'];

const ROLE_VARIANT: Record<UserRole, 'default' | 'secondary' | 'outline'> = {
  SUPER_ADMIN: 'default',
  ADMIN: 'default',
  MANAGER: 'secondary',
  TECHNICIAN: 'secondary',
  VIEWER: 'outline',
};

export function UsersTablePage({ users }: { users: UserRow[] }) {
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function onChangeRole(userId: string, newRole: UserRole) {
    setPendingId(userId);
    startTransition(async () => {
      try {
        await updateUserRole(userId, newRole);
        toast.success('Rol actualizado correctamente');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al actualizar el rol');
      } finally {
        setPendingId(null);
      }
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

  const usersHeader = {
    import: [],
    filters: [],
  };

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-hidden">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de roles del sistema
        </p>
      </div>

      <PageHeader pageHeader={usersHeader} />

      <div className="flex-1 min-h-0">
      <Show when={users.length > 0} fallback={<TableSkeleton columns={5} />}>
        <MainDataTable
          columns={columns}
          data={users}
          pageCount={1}
          rowCount={users.length}
          paginationState={{ limit: 20 }}
        />
      </Show>
      </div>
    </div>
  );
}
