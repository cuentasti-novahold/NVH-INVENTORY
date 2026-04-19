import type { BodegaRow } from '../dto/bodega.dto';

type PrismaBodegaWithRelations = {
  id: string;
  name: string;
  locationId: string;
  location: { name: string; city: { name: string } };
  _count: { assets: number };
};

export function toBodegaRow(b: PrismaBodegaWithRelations): BodegaRow {
  return {
    id: b.id,
    name: b.name,
    locationId: b.locationId,
    locationName: b.location.name,
    cityName: b.location.city.name,
    assetsCount: b._count.assets,
  };
}
