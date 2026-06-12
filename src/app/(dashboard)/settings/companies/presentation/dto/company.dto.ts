export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  assetsCount: number;
  sequencesCount: number;
}

export interface CreateCompanyDTO {
  code: string;
  name: string;
  isActive?: boolean;
}

export type UpdateCompanyDTO = Partial<CreateCompanyDTO>;
