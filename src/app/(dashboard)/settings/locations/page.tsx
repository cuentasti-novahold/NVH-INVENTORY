import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/permissions';
import { toCountryRow } from './presentation/mappers/country.mapper';
import { toCityRow } from './presentation/mappers/city.mapper';
import { toLocationRow } from './presentation/mappers/location.mapper';
import { toBodegaRow } from './presentation/mappers/bodega.mapper';
import { LocationsTabs } from './presentation/components/LocationsTabs';

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, 'locations', 'read')) {
    redirect('/');
  }

  const { tab } = await searchParams;
  const validTabs = ['paises', 'ciudades', 'sedes', 'bodegas'] as const;
  const initialTab = validTabs.includes(tab as (typeof validTabs)[number])
    ? (tab as (typeof validTabs)[number])
    : 'paises';

  const canWrite = hasPermission(session.user.role, 'locations', 'create');

  const [countries, cities, locations, bodegas] = await Promise.all([
    prisma.country.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { cities: true } } },
    }),
    prisma.city.findMany({
      orderBy: { name: 'asc' },
      include: {
        country: { select: { name: true } },
        _count: { select: { locations: true } },
      },
    }),
    prisma.location.findMany({
      orderBy: { name: 'asc' },
      include: {
        city: { select: { name: true, country: { select: { name: true } } } },
        _count: { select: { bodegas: true } },
      },
    }),
    prisma.bodega.findMany({
      orderBy: { name: 'asc' },
      include: {
        location: { select: { name: true, city: { select: { name: true } } } },
        _count: { select: { assets: true } },
      },
    }),
  ]);

  return (
    <LocationsTabs
      initialTab={initialTab}
      countries={countries.map(toCountryRow)}
      cities={cities.map(toCityRow)}
      locations={locations.map(toLocationRow)}
      bodegas={bodegas.map(toBodegaRow)}
      canWrite={canWrite}
    />
  );
}
