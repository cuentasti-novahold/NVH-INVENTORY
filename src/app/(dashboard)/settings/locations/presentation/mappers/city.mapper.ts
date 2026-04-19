import type { CityRow } from '../dto/city.dto';

type PrismaCityWithRelations = {
  id: string;
  name: string;
  countryId: string;
  country: { name: string };
  _count: { locations: number };
};

export function toCityRow(c: PrismaCityWithRelations): CityRow {
  return {
    id: c.id,
    name: c.name,
    countryId: c.countryId,
    countryName: c.country.name,
    locationsCount: c._count.locations,
  };
}
