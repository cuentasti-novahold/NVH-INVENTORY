import * as yup from 'yup';
import type { FieldConfig, FieldConfigValue } from '../dto/category.dto';

const VALID_VALUES: FieldConfigValue[] = ['required', 'optional', 'hidden'];

export function validateFieldConfig(raw: unknown): FieldConfig | null {
  if (raw == null || raw === '') return null;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new yup.ValidationError('JSON inválido', raw, 'fieldConfig');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new yup.ValidationError('fieldConfig debe ser un objeto', raw, 'fieldConfig');
  for (const [k, v] of Object.entries(parsed)) {
    if (!VALID_VALUES.includes(v as FieldConfigValue))
      throw new yup.ValidationError(
        `Valor inválido para "${k}" — use required | optional | hidden`,
        raw,
        'fieldConfig',
      );
  }
  return parsed as FieldConfig;
}

export const categoryCreateSchema = yup.object({
  name: yup.string().trim().min(2).max(80).required('Nombre requerido'),
  prefix: yup
    .string()
    .trim()
    .matches(/^[A-Z0-9]{2,6}$/, 'Prefijo: 2-6 caracteres, mayúsculas o dígitos')
    .required('Prefijo requerido'),
  description: yup.string().trim().max(500).nullable().optional(),
  parentId: yup.string().min(1).nullable().optional(),
  defaultUsefulLife: yup.number().integer().min(1).max(50).nullable().optional(),
  fieldConfig: yup.mixed().nullable().optional().transform(validateFieldConfig),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();
