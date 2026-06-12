import type { UserRole } from '@/generated/prisma';

export type Resource =
  | 'assets' | 'employees' | 'assignments' | 'categories'
  | 'locations' | 'maintenance' | 'users' | 'movements' | 'currencies' | 'departments'
  | 'auditLogs' | 'companies';

export type Action = 'create' | 'read' | 'update' | 'delete';

type Permission = '*' | `${Resource}:*` | `${Resource}:${Action}`;

const PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['assets:*', 'employees:*', 'assignments:*', 'categories:*', 'locations:*', 'movements:*', 'maintenance:*', 'currencies:*', 'departments:*', 'auditLogs:read', 'companies:*'],
  MANAGER: ['assets:read', 'employees:read', 'assignments:create', 'categories:read', 'locations:read', 'movements:read', 'movements:create', 'maintenance:read', 'currencies:read', 'departments:read', 'companies:read'],
  TECHNICIAN: ['assets:read', 'assets:create', 'assets:update', 'employees:read', 'maintenance:create', 'maintenance:read', 'maintenance:update', 'categories:read', 'locations:read', 'movements:read', 'movements:create', 'currencies:read', 'departments:read', 'companies:read'],
  VIEWER: ['assets:read', 'employees:read', 'categories:read', 'locations:read', 'movements:read', 'maintenance:read', 'currencies:read', 'departments:read', 'companies:read'],
};

export function hasPermission(role: UserRole, resource: Resource, action: Action): boolean {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  return (
    perms.includes('*') ||
    perms.includes(`${resource}:*` as Permission) ||
    perms.includes(`${resource}:${action}` as Permission)
  );
}

/** Returns true if the role has any permission (read/create/update/delete) on the resource. */
export function canAccessResource(role: UserRole, resource: Resource): boolean {
  return (['read', 'create', 'update', 'delete'] as const).some(
    (action) => hasPermission(role, resource, action),
  );
}
