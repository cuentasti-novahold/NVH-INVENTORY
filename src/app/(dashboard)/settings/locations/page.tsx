import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import {
  listCountriesAction,
  listCitiesAction,
  listLocationsAction,
  listBodegasAction,
} from './actions';
import { LocationsTabs } from './presentation/components/LocationsTabs';

function parsePageSize(s?: string) {
  return Math.min(100, Math.max(5, Number(s ?? 20) || 20));
}

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    paises_afterCursor?: string; paises_beforeCursor?: string; paises_pageSize?: string; paises_q?: string;
    ciudades_afterCursor?: string; ciudades_beforeCursor?: string; ciudades_pageSize?: string; ciudades_q?: string;
    sedes_afterCursor?: string; sedes_beforeCursor?: string; sedes_pageSize?: string; sedes_q?: string;
    bodegas_afterCursor?: string; bodegas_beforeCursor?: string; bodegas_pageSize?: string; bodegas_q?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role, 'locations', 'read')) {
    redirect('/');
  }

  const sp = await searchParams;

  const validTabs = ['paises', 'ciudades', 'sedes', 'bodegas'] as const;
  const initialTab = validTabs.includes(sp.tab as (typeof validTabs)[number])
    ? (sp.tab as (typeof validTabs)[number])
    : 'paises';

  const canWrite = hasPermission(session.user.role, 'locations', 'create');

  const [countries, cities, locs, bodegasRes] = await Promise.all([
    listCountriesAction({ pageSize: parsePageSize(sp.paises_pageSize), afterCursor: sp.paises_afterCursor || undefined, beforeCursor: sp.paises_beforeCursor || undefined, q: sp.paises_q || undefined }),
    listCitiesAction({ pageSize: parsePageSize(sp.ciudades_pageSize), afterCursor: sp.ciudades_afterCursor || undefined, beforeCursor: sp.ciudades_beforeCursor || undefined, q: sp.ciudades_q || undefined }),
    listLocationsAction({ pageSize: parsePageSize(sp.sedes_pageSize), afterCursor: sp.sedes_afterCursor || undefined, beforeCursor: sp.sedes_beforeCursor || undefined, q: sp.sedes_q || undefined }),
    listBodegasAction({ pageSize: parsePageSize(sp.bodegas_pageSize), afterCursor: sp.bodegas_afterCursor || undefined, beforeCursor: sp.bodegas_beforeCursor || undefined, q: sp.bodegas_q || undefined }),
  ]);

  if (!countries.ok || !cities.ok || !locs.ok || !bodegasRes.ok) redirect('/');

  return (
    <LocationsTabs
      initialTab={initialTab}
      canWrite={canWrite}
      countries={countries.data}
      cities={cities.data}
      locations={locs.data}
      bodegas={bodegasRes.data}
      countriesQ={sp.paises_q ?? ''}
      citiesQ={sp.ciudades_q ?? ''}
      locationsQ={sp.sedes_q ?? ''}
      bodegasQ={sp.bodegas_q ?? ''}
    />
  );
}
