export interface CountryRow {
  id: string;
  name: string;
  code: string;
  citiesCount: number;
}

export interface CreateCountryDTO {
  name: string;
  code: string;
}

export type UpdateCountryDTO = Partial<CreateCountryDTO>;
