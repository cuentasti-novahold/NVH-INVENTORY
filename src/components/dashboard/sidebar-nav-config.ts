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
  type LucideIcon,
} from 'lucide-react';

export type SidebarSectionLabel = 'CATÁLOGOS' | 'OPERACIONES' | 'SISTEMA';

export interface SidebarNavItemConfig {
  href: string;
  label: string;
  icon: LucideIcon;
  matchMode?: 'exact' | 'startsWith';
}

export interface SidebarNavSection {
  label: SidebarSectionLabel;
  items: SidebarNavItemConfig[];
}

export const SIDEBAR_NAV_SECTIONS: SidebarNavSection[] = [
  {
    label: 'CATÁLOGOS',
    items: [
      { href: '/settings/categories', label: 'Categorías', icon: Boxes },
      { href: '/settings/locations', label: 'Ubicaciones', icon: MapPin },
    ],
  },
  {
    label: 'OPERACIONES',
    items: [
      { href: '/assets', label: 'Activos', icon: Package },
      { href: '/employees', label: 'Empleados', icon: Users },
      { href: '/assignments', label: 'Asignaciones', icon: ClipboardList },
      { href: '/movimientos', label: 'Traslados', icon: ArrowRightLeft },
      { href: '/maintenance', label: 'Mantenimiento', icon: Wrench },
      { href: '/analytics', label: 'Analítica', icon: BarChart2 },
      { href: '/scanner', label: 'Escáner QR', icon: QrCode },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { href: '/settings/users', label: 'Usuarios', icon: ShieldCheck },
    ],
  },
];
