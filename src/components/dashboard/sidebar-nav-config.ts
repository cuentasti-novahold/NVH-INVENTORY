import {
  Boxes,
  Users,
  MapPin,
  Package,
  ClipboardList,
  Wrench,
  ShieldCheck,
  ArrowRightLeft,
  BarChart2,
  QrCode,
  Coins,
  Building2,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/generated/prisma';
import { canAccessResource, type Resource } from '@/lib/permissions';

export type SidebarSectionLabel = 'CATÁLOGOS' | 'OPERACIONES' | 'SISTEMA';

export interface SidebarNavItemConfig {
  href: string;
  label: string;
  icon: LucideIcon;
  matchMode?: 'exact' | 'startsWith';
  /** When set, the item is only shown if the user has read permission on this resource. */
  resource?: Resource;
}

export interface SidebarNavSection {
  label: SidebarSectionLabel;
  items: SidebarNavItemConfig[];
}

export const SIDEBAR_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: 'CATÁLOGOS',
    items: [
      { href: '/settings/categories', label: 'Categorías', icon: Boxes, resource: 'categories' },
      { href: '/settings/departments', label: 'Departamentos', icon: Building2, resource: 'departments' },
      { href: '/settings/locations', label: 'Ubicaciones', icon: MapPin, resource: 'locations' },
      { href: '/settings/currencies', label: 'Monedas', icon: Coins, resource: 'currencies' },
    ],
  },
  {
    label: 'OPERACIONES',
    items: [
      { href: '/assets', label: 'Activos', icon: Package, resource: 'assets' },
      { href: '/employees', label: 'Empleados', icon: Users, resource: 'employees' },
      { href: '/assignments', label: 'Asignaciones', icon: ClipboardList, resource: 'assignments' },
      { href: '/movimientos', label: 'Traslados', icon: ArrowRightLeft, resource: 'movements' },
      { href: '/maintenance', label: 'Mantenimiento', icon: Wrench, resource: 'maintenance' },
      { href: '/analytics', label: 'Analítica', icon: BarChart2 },
      { href: '/scanner', label: 'Escáner QR', icon: QrCode },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { href: '/settings/users', label: 'Usuarios', icon: ShieldCheck, resource: 'users' },
    ],
  },
];

/** Returns only the sections and items the given role is allowed to see. */
export function getFilteredNavSections(role: UserRole): SidebarNavSection[] {
  return SIDEBAR_NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.resource || canAccessResource(role, item.resource),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
