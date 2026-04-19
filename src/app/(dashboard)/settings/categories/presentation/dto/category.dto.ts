export type FieldConfigValue = 'required' | 'optional' | 'hidden';
export type FieldConfig = Record<string, FieldConfigValue>;

export interface CategoryRow {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  defaultUsefulLife: number | null;
  parentId: string | null;
  parentName: string | null;
  childrenCount: number;
  assetsCount: number;
  fieldConfig: FieldConfig | null;
  createdAt: string;
}

export interface CreateCategoryDTO {
  name: string;
  prefix: string;
  description?: string | null;
  parentId?: string | null;
  defaultUsefulLife?: number | null;
  fieldConfig?: FieldConfig | null;
}

export type UpdateCategoryDTO = Partial<CreateCategoryDTO>;
