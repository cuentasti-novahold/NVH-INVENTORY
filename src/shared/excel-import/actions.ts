'use server';

import * as XLSX from 'xlsx';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/permissions';
import type { Resource } from '@/lib/permissions';
import { ok, err, type ActionResult } from '@/shared/types/action-result';
import { getImportConfig } from './registry';
import { parseExcelFile, ExcelParseError } from './parser';
import { validateRows } from './validator';
import { runMasterValidations } from './master-validator';
import { buildErrorExcel } from './error-excel-builder';
import { writeImportLog } from './log';
import type { ImportPreviewResult, ImportConfirmResult } from './types';

// ─── Auth helper ───────────────────────────────────────────────────────────

type Role = Parameters<typeof hasPermission>[0];

type AuthCheck =
  | { ok: true; userId: string }
  | { ok: false; error: ActionResult<never> };

async function requireImportPermission(moduleKey: string): Promise<AuthCheck> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: err('UNAUTHORIZED', 'No autenticado') };
  }
  if (!hasPermission(session.user.role as Role, moduleKey as Resource, 'create')) {
    return { ok: false, error: err('FORBIDDEN', 'Sin permiso para importar este módulo') };
  }
  return { ok: true, userId: session.user.id as string };
}

// ─── Internal: parse + validate pipeline ──────────────────────────────────

interface ParseValidateResult {
  rows: Record<string, unknown>[];
  validRows: Record<string, unknown>[];
  rowNumbers: number[];
  allErrors: import('./types').RowError[];
}

async function parseAndValidate(
  moduleKey: string,
  fileBase64: string,
): Promise<
  | { ok: true; result: ParseValidateResult; config: ReturnType<typeof getImportConfig> }
  | { ok: false; error: ActionResult<never> }
> {
  let config: ReturnType<typeof getImportConfig>;
  try {
    config = getImportConfig(moduleKey);
  } catch {
    return { ok: false, error: err('VALIDATION', 'Módulo no soportado') };
  }

  let rows: Record<string, unknown>[];
  try {
    rows = parseExcelFile(fileBase64, config.sheetName, config.maxRows ?? 5000);
  } catch (e) {
    if (e instanceof ExcelParseError) {
      return { ok: false, error: err('VALIDATION', e.message) };
    }
    return { ok: false, error: err('UNKNOWN', 'Error al procesar el archivo') };
  }

  const { validRows, errors: typeErrors, rowNumbers } = validateRows(rows, config.columns);

  const masterErrors = config.masterValidations?.length
    ? await runMasterValidations(validRows, config.masterValidations, rowNumbers)
    : [];

  const allErrors = [...typeErrors, ...masterErrors];

  return { ok: true, result: { rows, validRows, rowNumbers, allErrors }, config };
}

// ─── previewImportAction ───────────────────────────────────────────────────

/**
 * Phase 1: parse + validate the file and return a preview.
 * NEVER writes to the DB. NEVER writes an ImportLog.
 */
export async function previewImportAction(
  moduleKey: string,
  fileBase64: string,
  fileName: string,
): Promise<ActionResult<ImportPreviewResult>> {
  // 1. Auth
  const authCheck = await requireImportPermission(moduleKey);
  if (!authCheck.ok) return authCheck.error;

  // 2. Parse + validate
  const pv = await parseAndValidate(moduleKey, fileBase64);
  if (!pv.ok) return pv.error;

  const { result, config } = pv;
  const { rows, allErrors } = result;

  // 3. Filter valid rows (exclude rows with master errors)
  const errorRowNums = new Set(allErrors.map((e) => e.row));
  const typeValidRows = result.validRows.filter(
    (_, i) => !errorRowNums.has(result.rowNumbers[i]!),
  );

  // 4. Apply transformer
  const transformed = config.rowTransformer
    ? typeValidRows.map((r) => config.rowTransformer!(r) as Record<string, unknown>)
    : typeValidRows;

  const uniqueErrorRows = new Set(allErrors.map((e) => e.row)).size;

  // 5. Build error file when errors exist
  const errorFileBase64 =
    allErrors.length > 0
      ? buildErrorExcel(rows, allErrors, config.columns, config.sheetName)
      : undefined;

  const preview: ImportPreviewResult = {
    totalRows: rows.length,
    validCount: transformed.length,
    errorCount: uniqueErrorRows,
    validRows: transformed,
    errors: allErrors,
    errorFileBase64,
  };

  return ok(preview);
}

// ─── confirmImportAction ───────────────────────────────────────────────────

/**
 * Phase 2: re-parse, re-validate (server trust), then call the module handler.
 * Always writes an ImportLog.
 */
export async function confirmImportAction(
  moduleKey: string,
  fileBase64: string,
  fileName: string,
): Promise<ActionResult<ImportConfirmResult>> {
  // 1. Auth
  const authCheck = await requireImportPermission(moduleKey);
  if (!authCheck.ok) return authCheck.error;
  const { userId } = authCheck;

  // 2. Re-parse + re-validate (never trust client-sent rows)
  const pv = await parseAndValidate(moduleKey, fileBase64);
  if (!pv.ok) return pv.error;

  const { result, config } = pv;
  const { rows, allErrors } = result;

  // 3. Filter valid rows (exclude any row that has master or type errors)
  const errorRowNums = new Set(allErrors.map((e) => e.row));
  const validRowsForHandler = result.validRows.filter(
    (_, i) => !errorRowNums.has(result.rowNumbers[i]!),
  );

  // 4. Apply transformer
  const transformedRows = config.rowTransformer
    ? validRowsForHandler.map((r) => config.rowTransformer!(r))
    : validRowsForHandler;

  // 5. All-failed-before-handler: no valid rows to process
  if (transformedRows.length === 0) {
    const uniqueErrorRows = new Set(allErrors.map((e) => e.row)).size;
    const errorFileBase64 =
      allErrors.length > 0
        ? buildErrorExcel(rows, allErrors, config.columns, config.sheetName)
        : undefined;

    const confirmResult: ImportConfirmResult = {
      totalReceived: rows.length,
      created: 0,
      failed: uniqueErrorRows,
      errors: allErrors.map((e, i) => ({
        index: i,
        data: {} as Record<string, unknown>,
        error: e.message,
      })),
      errorFileBase64,
    };

    await writeImportLog(config.entity, confirmResult, userId, fileName);
    return ok(confirmResult);
  }

  // 6. Delegate to module handler (handler owns ImportLog when it runs)
  try {
    const handlerResult = await config.handler(transformedRows, userId, fileName);
    return ok(handlerResult);
  } catch (e) {
    return err('UNKNOWN', e instanceof Error ? e.message : 'Error al importar');
  }
}

// ─── getImportTemplateAction ────────────────────────────────────────────────

/**
 * Generate a blank .xlsx template with header row and optional example row.
 */
export async function getImportTemplateAction(
  moduleKey: string,
): Promise<ActionResult<{ fileBase64: string; fileName: string }>> {
  // 1. Auth
  const authCheck = await requireImportPermission(moduleKey);
  if (!authCheck.ok) return authCheck.error;

  // 2. Get config
  let config: ReturnType<typeof getImportConfig>;
  try {
    config = getImportConfig(moduleKey);
  } catch {
    return err('VALIDATION', 'Módulo no soportado');
  }

  // 3. Build workbook
  const headers = config.columns.map((c) => c.header);
  const exampleRow = config.columns.map((c) => c.example ?? '');
  const hasExamples = config.columns.some((c) => c.example);

  const aoa = hasExamples ? [headers, exampleRow] : [headers];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Apply column widths when provided
  const colWidths = config.columns.map((c) => ({ wch: c.width ?? 18 }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, config.sheetName);

  const fileBase64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;

  return ok({
    fileBase64,
    fileName: `${config.moduleKey}-template.xlsx`,
  });
}

// ─── getImportSchemaAction ──────────────────────────────────────────────────

export interface ImportSchemaSummary {
  requiredFields: string[];
  optionalFields: string[];
}

/**
 * Return required and optional field headers for a module — used by the dialog
 * to show users which columns the file must contain before they upload.
 */
export async function getImportSchemaAction(
  moduleKey: string,
): Promise<ActionResult<ImportSchemaSummary>> {
  const authCheck = await requireImportPermission(moduleKey);
  if (!authCheck.ok) return authCheck.error;

  let config: ReturnType<typeof getImportConfig>;
  try {
    config = getImportConfig(moduleKey);
  } catch {
    return err('VALIDATION', 'Módulo no soportado');
  }

  const requiredFields = config.columns
    .filter((c) => c.required)
    .map((c) => c.header);
  const optionalFields = config.columns
    .filter((c) => !c.required)
    .map((c) => c.header);

  return ok({ requiredFields, optionalFields });
}
