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
 */
export async function runMasterValidations(
  rows: Record<string, unknown>[],
  masterValidations: MasterValidation[],
): Promise<RowError[]> {
  if (!masterValidations.length) return [];

  const allErrors = await Promise.all(
    masterValidations.map(async (mv) => {
      // 1. Collect unique non-empty string values
      const uniqueValues = new Set<string>();
      for (const row of rows) {
        const raw = row[mv.key];
        if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
          uniqueValues.add(String(raw).trim());
        }
      }

      // No values to look up — all cells are empty/null, skip Prisma call
      if (uniqueValues.size === 0) return [] as RowError[];

      // 2. Lookup valid values
      const validSet = await mv.lookup(Array.from(uniqueValues));

      // 3. Find rows that reference an invalid value
      const errors: RowError[] = [];
      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i][mv.key];
        if (raw === null || raw === undefined || String(raw).trim() === '') continue;
        const strVal = String(raw).trim();
        if (!validSet.has(strVal)) {
          // Row number: validRows are 0-indexed slices of the full dataset.
          // We can only compute approximate position; callers may pass validRows
          // whose original row numbers are lost here. Use index + 2 as best-effort.
          errors.push({
            row: i + 2,
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
