import type { ColumnDef, RowError } from './types';

// ─── Boolean accepted values ───────────────────────────────────────────────

const BOOLEAN_TRUE = new Set(['true', '1', 'si', 'sí']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no']);

// ─── Helpers ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCell(
  value: unknown,
  col: ColumnDef,
  rowNumber: number,
): RowError[] {
  const errors: RowError[] = [];

  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '');

  // Required check
  if (col.required && isEmpty) {
    errors.push({ row: rowNumber, field: col.key, message: 'Campo obligatorio' });
    // No further checks when value is absent
    return errors;
  }

  // Skip further type checks when value is empty and field is optional
  if (isEmpty) return errors;

  const strValue = String(value);

  switch (col.type) {
    case 'string': {
      if (col.maxLength && strValue.length > col.maxLength) {
        errors.push({
          row: rowNumber,
          field: col.key,
          message: `Excede longitud máxima de ${col.maxLength}`,
        });
      }
      break;
    }

    case 'number': {
      if (Number.isNaN(Number(value))) {
        errors.push({ row: rowNumber, field: col.key, message: 'Debe ser numérico' });
      }
      break;
    }

    case 'boolean': {
      const lower = strValue.toLowerCase().trim();
      if (!BOOLEAN_TRUE.has(lower) && !BOOLEAN_FALSE.has(lower)) {
        errors.push({
          row: rowNumber,
          field: col.key,
          message: 'Debe ser sí/no o true/false',
        });
      }
      break;
    }

    case 'email': {
      if (!EMAIL_RE.test(strValue.trim())) {
        errors.push({ row: rowNumber, field: col.key, message: 'Email inválido' });
      }
      break;
    }

    case 'enum': {
      if (!col.enumValues.includes(strValue)) {
        errors.push({
          row: rowNumber,
          field: col.key,
          message: `Debe ser uno de: ${col.enumValues.join(', ')}`,
        });
      }
      break;
    }

    case 'date': {
      const d = new Date(strValue);
      if (Number.isNaN(d.getTime())) {
        errors.push({ row: rowNumber, field: col.key, message: 'Fecha inválida' });
      }
      break;
    }
  }

  return errors;
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface ValidateRowsResult {
  validRows: Record<string, unknown>[];
  errors: RowError[];
  /** Parallel array to validRows — the original 1-based Excel row number for each valid row */
  rowNumbers: number[];
}

/**
 * Validate an array of parsed rows against the declared column definitions.
 * Accumulates ALL errors per row (no short-circuit).
 * Rows with any error are excluded from validRows but their errors are collected.
 *
 * Row numbering: header is row 1, first data row is row 2.
 */
export function validateRows(
  rows: Record<string, unknown>[],
  columns: ColumnDef[],
): ValidateRowsResult {
  const validRows: Record<string, unknown>[] = [];
  const errors: RowError[] = [];
  const rowNumbers: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Excel row number: header = 1, data starts at 2
    const rowNumber = i + 2;
    const rowErrors: RowError[] = [];

    for (const col of columns) {
      const cellErrors = validateCell(row[col.key], col, rowNumber);
      rowErrors.push(...cellErrors);
    }

    if (rowErrors.length === 0) {
      validRows.push(row);
      rowNumbers.push(rowNumber);
    } else {
      errors.push(...rowErrors);
    }
  }

  return { validRows, errors, rowNumbers };
}
