import type { CompanyRow } from '../dto/company.dto';

type CompanyWithRelations = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  _count: { assets: number; categorySequences: number };
};

export const companyInclude = {
  _count: { select: { assets: true, categorySequences: true } },
} as const;

export function toCompanyRow(c: CompanyWithRelations): CompanyRow {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    isActive: c.isActive,
    assetsCount: c._count.assets,
    sequencesCount: c._count.categorySequences,
  };
}
