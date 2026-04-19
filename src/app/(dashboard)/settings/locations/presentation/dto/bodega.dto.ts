export interface BodegaRow {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  cityName: string;
  assetsCount: number;
}

export interface CreateBodegaDTO {
  name: string;
  locationId: string;
}

export type UpdateBodegaDTO = Partial<CreateBodegaDTO>;
