import type { UserRole } from '@/generated/prisma';

export type Resource =
  | 'assets' | 'employees' | 'assignments' | 'categories'
  | 'locations' | 'maintenance' | 'users' | 'movements' | 'currencies';

export type Action = 'create' | 'read' | 'update' | 'delete';

type Permission = '*' | `${Resource}:*` | `${Resource}:${Action}`;

const PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['assets:*', 'employees:*', 'assignments:*', 'categories:*', 'locations:*', 'movements:*', 'maintenance:*', 'currencies:*'],
  MANAGER: ['assets:read', 'employees:read', 'assignments:create', 'categories:read', 'locations:read', 'movements:read', 'movements:create', 'maintenance:read', 'currencies:read'],
  TECHNICIAN: ['assets:create', 'assets:update', 'maintenance:create', 'maintenance:read', 'maintenance:update', 'categories:read', 'locations:read', 'movements:read', 'movements:create', 'currencies:read'],
  VIEWER: ['assets:read', 'employees:read', 'categories:read', 'locations:read', 'movements:read', 'maintenance:read', 'currencies:read'],
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
