import type { UserRole } from '@/generated/prisma';

export type Resource =
  | 'assets' | 'employees' | 'assignments' | 'categories'
  | 'locations' | 'maintenance' | 'users';

export type Action = 'create' | 'read' | 'update' | 'delete';

type Permission = '*' | `${Resource}:*` | `${Resource}:${Action}`;

const PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['assets:*', 'employees:*', 'assignments:*', 'categories:*', 'locations:*'],
  MANAGER: ['assets:read', 'employees:read', 'assignments:create'],
  TECHNICIAN: ['assets:create', 'assets:update', 'maintenance:*'],
  VIEWER: ['assets:read', 'employees:read'],
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
