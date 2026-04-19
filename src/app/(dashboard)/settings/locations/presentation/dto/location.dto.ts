export interface LocationRow {
  id: string;
  name: string;
  address: string | null;
  cityId: string;
  cityName: string;
  countryName: string;
  bodegasCount: number;
}

export interface CreateLocationDTO {
  name: string;
  address?: string | null;
  cityId: string;
}

export type UpdateLocationDTO = Partial<CreateLocationDTO>;
