import type { CountryRow } from '../dto/country.dto';

type PrismaCountryWithCount = {
  id: string;
  name: string;
  code: string;
  _count: { cities: number };
};

export function toCountryRow(c: PrismaCountryWithCount): CountryRow {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    citiesCount: c._count.cities,
  };
}
