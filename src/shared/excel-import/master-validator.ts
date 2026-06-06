import type { MasterValidation, RowError } from './types';

/**
 * Run all master-data validations in parallel against type-validated rows.
 *
 * For each MasterValidation:
 *  1. Collect all unique non-null/non-empty values for that column key
 *  2. Call lookup(values) to retrieve the set of valid values
 *  3. For each row where the value is present and NOT in the valid set → RowError
 *
 * Rows should already have passed type validation (validRows from validateRows).
 * This function does NOT re-run type validation.
 *
 * @param rows             - Type-valid rows (output of validateRows.validRows)
 * @param masterValidations - MasterValidation array from ExcelImportConfig
 * @param rowNumbers        - Parallel array to rows: the original 1-based Excel row number
 *                            for each entry. When provided, error.row uses the exact Excel
 *                            position instead of the approximated i+2.
 *                            Must have the same length as rows when provided.
 */
export async function runMasterValidations(
  rows: Record<string, unknown>[],
  masterValidations: MasterValidation[],
  rowNumbers?: number[],
): Promise<RowError[]> {
  if (!masterValidations.length) return [];

  const allErrors = await Promise.all(
    masterValidations.map(async (mv) => {
      // 1. Collect unique non-empty string values (NFC-normalized to handle Excel NFD encoding)
      const uniqueValues = new Set<string>();
      for (const row of rows) {
        const raw = row[mv.key];
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
          uniqueValues.add(String(raw).trim().normalize('NFC'));
        }
      }

      // No values to look up — all cells are empty/null, skip Prisma call
      if (uniqueValues.size === 0) return [] as RowError[];

      // 2. Lookup valid values and normalize DB results to NFC for consistent comparison
      const rawValidSet = await mv.lookup(Array.from(uniqueValues));
      const validSet = new Set(Array.from(rawValidSet).map((v) => v.normalize('NFC')));

      // 3. Find rows that reference an invalid value
      const errors: RowError[] = [];
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i][mv.key];
        if (raw === null || raw === undefined || String(raw).trim() === '') continue;
        const strVal = String(raw).trim().normalize('NFC');
        if (!validSet.has(strVal)) {
          // Use the exact Excel row number when provided (from validateRows.rowNumbers).
          // Fall back to i+2 approximation only when rowNumbers is absent.
          const row = rowNumbers?.[i] ?? i + 2;
          errors.push({
            row,
            field: mv.key,
            message: mv.errorMessage,
          });
        }
      }

      return errors;
    }),
  );

  return allErrors.flat();
}
