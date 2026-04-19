'use client';

import { useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Globe, Building2, MapPin, Warehouse } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CountriesTablePage } from './CountriesTablePage';
import { CitiesTablePage } from './CitiesTablePage';
import { LocationsTablePage } from './LocationsTablePage';
import { BodegasTablePage } from './BodegasTablePage';
import type { CountryRow } from '../dto/country.dto';
import type { CityRow } from '../dto/city.dto';
import type { LocationRow } from '../dto/location.dto';
import type { BodegaRow } from '../dto/bodega.dto';

const TAB_CONFIG = [
  { value: 'paises', label: 'Países', icon: Globe },
  { value: 'ciudades', label: 'Ciudades', icon: Building2 },
  { value: 'sedes', label: 'Sedes', icon: MapPin },
  { value: 'bodegas', label: 'Bodegas', icon: Warehouse },
] as const;

export function LocationsTabs({
  initialTab,
  countries,
  cities,
  locations,
  bodegas,
  canWrite,
}: {
  initialTab: string;
  countries: CountryRow[];
  cities: CityRow[];
  locations: LocationRow[];
  bodegas: BodegaRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();

  function onChange(v: string) {
    const params = new URLSearchParams(sp.toString());
    params.set('tab', v);
    start(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-tight">Ubicaciones</h1>
          <p className="text-sm text-muted-foreground">Países, ciudades, sedes y bodegas</p>
        </div>
      </div>

      <Tabs value={initialTab} onValueChange={onChange}>
        <div className="border-b border-border">
          <TabsList variant="line" className="h-auto w-fit gap-0 pb-0">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-2 rounded-none px-4 pb-3 pt-1 text-sm font-medium after:bg-accent"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="paises" className="mt-4">
          <CountriesTablePage initialRows={countries} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="ciudades" className="mt-4">
          <CitiesTablePage initialRows={cities} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="sedes" className="mt-4">
          <LocationsTablePage initialRows={locations} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="bodegas" className="mt-4">
          <BodegasTablePage initialRows={bodegas} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
