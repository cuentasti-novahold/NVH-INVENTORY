export interface CityRow {
  id: string;
  name: string;
  countryId: string;
  countryName: string;
  locationsCount: number;
}

export interface CreateCityDTO {
  name: string;
  countryId: string;
}

export type UpdateCityDTO = Partial<CreateCityDTO>;
