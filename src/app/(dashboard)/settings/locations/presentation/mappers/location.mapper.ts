import type { LocationRow } from '../dto/location.dto';

type PrismaLocationWithRelations = {
  id: string;
  name: string;
  address: string | null;
  cityId: string;
  city: { name: string; country: { name: string } };
  _count: { bodegas: number };
};

export function toLocationRow(l: PrismaLocationWithRelations): LocationRow {
  return {
    id: l.id,
    name: l.name,
    address: l.address,
    cityId: l.cityId,
    cityName: l.city.name,
    countryName: l.city.country.name,
    bodegasCount: l._count.bodegas,
  };
}
