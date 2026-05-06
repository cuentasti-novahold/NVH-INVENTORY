import * as XLSX from 'xlsx';
import type { ColumnDef, RowError } from './types';

/**
 * Build an error report Excel file as a base64 string.
 *
 * The output contains all original rows plus an extra "Errores" column on the right.
 * Each row's "Errores" cell contains the semicolon-separated error messages for that row.
 * Rows without errors get an empty string in the "Errores" cell.
 *
 * @param rows      - Original parsed rows (all rows, including those with errors)
 * @param errors    - RowError array from validateRows / runMasterValidations
 * @param columns   - Column definitions (used to determine header labels)
 * @param sheetName - Sheet name for the output workbook
 * @returns         Base64-encoded .xlsx file
 */
export function buildErrorExcel(
  rows: Record<string, unknown>[],
  errors: RowError[],
  columns: ColumnDef[],
  sheetName: string,
): string {
  // Build a map: rowNumber (1-based, header=1, data starts at 2) → error messages
  const errorsByRow = new Map<number, string[]>();
  for (const e of errors) {
    const msgs = errorsByRow.get(e.row) ?? [];
    msgs.push(e.message);
    errorsByRow.set(e.row, msgs);
  }

  // Build the header row using column headers + "Errores"
  const headers = columns.map((c) => c.header);
  const headerRow = [...headers, 'Errores'];

  // Build data rows: each row's values in column-key order + error string
  const dataRows = rows.map((row, i) => {
    // i is 0-based, Excel data starts at row 2 (header = row 1)
    const rowNumber = i + 2;
    const values = columns.map((c) => {
      const v = row[c.key];
      return v === null || v === undefined ? '' : v;
    });
    const errorMessages = errorsByRow.get(rowNumber) ?? [];
    values.push(errorMessages.join('; '));
    return values;
  });

  const aoa = [headerRow, ...dataRows];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
}
