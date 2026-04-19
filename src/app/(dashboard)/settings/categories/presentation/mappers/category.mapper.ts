import type { CategoryRow, FieldConfig } from '../dto/category.dto';

type PrismaCategoryWithRelations = {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  defaultUsefulLife: number | null;
  parentId: string | null;
  createdAt: Date;
  fieldConfig: unknown;
  parent: { name: string } | null;
  _count: { children: number; assets: number };
};

export function toCategoryRow(c: PrismaCategoryWithRelations): CategoryRow {
  return {
    id: c.id,
    name: c.name,
    prefix: c.prefix,
    description: c.description,
    defaultUsefulLife: c.defaultUsefulLife,
    parentId: c.parentId,
    parentName: c.parent?.name ?? null,
    childrenCount: c._count.children,
    assetsCount: c._count.assets,
    fieldConfig: (c.fieldConfig as FieldConfig | null) ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}
