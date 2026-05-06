import * as XLSX from 'xlsx';

// ─── Custom error ──────────────────────────────────────────────────────────

export type ExcelParseErrorCode = 'SHEET_NOT_FOUND' | 'EMPTY_SHEET' | 'BAD_FILE' | 'MAX_ROWS';

export class ExcelParseError extends Error {
  constructor(
    public readonly code: ExcelParseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExcelParseError';
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_ROWS = 5000;

// ─── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse an xlsx file from its base64 representation.
 *
 * @param fileBase64 - Base64-encoded .xlsx file content
 * @param sheetName  - Expected sheet name (exact match)
 * @param maxRows    - Maximum allowed data rows (default 5000)
 * @returns          Array of row objects keyed by the header row values
 *
 * @throws {ExcelParseError} with code BAD_FILE, SHEET_NOT_FOUND, EMPTY_SHEET, or MAX_ROWS
 */
export function parseExcelFile(
  fileBase64: string,
  sheetName: string,
  maxRows: number = DEFAULT_MAX_ROWS,
): Record<string, unknown>[] {
  // 1. Decode base64 and enforce size limit
  let buffer: Buffer;
  try {
    buffer = Buffer.from(fileBase64, 'base64');
  } catch {
    throw new ExcelParseError('BAD_FILE', 'El archivo no es válido o está corrupto');
  }

  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw new ExcelParseError(
      'BAD_FILE',
      `El archivo supera el límite máximo de ${MAX_FILE_BYTES / 1024 / 1024} MB`,
    );
  }

  // 2. Parse workbook
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new ExcelParseError('BAD_FILE', 'El archivo no es válido o está corrupto');
  }

  // 3. Validate sheet exists
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new ExcelParseError(
      'SHEET_NOT_FOUND',
      `Hoja "${sheetName}" no encontrada en el archivo`,
    );
  }

  // 4. Convert to JSON (header row becomes keys; missing cells → null)
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  if (rows.length === 0) {
    throw new ExcelParseError('EMPTY_SHEET', `La hoja "${sheetName}" no contiene datos`);
  }

  // 5. Enforce maxRows limit
  if (rows.length > maxRows) {
    throw new ExcelParseError(
      'MAX_ROWS',
      `El archivo excede el límite de ${maxRows} filas permitidas`,
    );
  }

  return rows;
}
