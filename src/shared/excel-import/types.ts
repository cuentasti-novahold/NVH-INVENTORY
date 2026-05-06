// ─── Column definitions ────────────────────────────────────────────────────

export interface ColumnDefBase {
  header: string;
  key: string;
  required?: boolean;
  width?: number;
  example?: string;
}

export interface StringColumnDef extends ColumnDefBase {
  type: 'string';
  maxLength?: number;
}

export interface NumberColumnDef extends ColumnDefBase {
  type: 'number';
}

export interface BooleanColumnDef extends ColumnDefBase {
  type: 'boolean';
}

export interface EmailColumnDef extends ColumnDefBase {
  type: 'email';
}

export interface EnumColumnDef extends ColumnDefBase {
  type: 'enum';
  enumValues: readonly string[];
}

export interface DateColumnDef extends ColumnDefBase {
  type: 'date';
}

export type ColumnDef =
  | StringColumnDef
  | NumberColumnDef
  | BooleanColumnDef
  | EmailColumnDef
  | EnumColumnDef
  | DateColumnDef;

// ─── Master validation ─────────────────────────────────────────────────────

export interface MasterValidation {
  key: string;
  lookup: (values: string[]) => Promise<Set<string>>;
  errorMessage: string;
}

// ─── Config ────────────────────────────────────────────────────────────────

/** Alias — moduleKey doubles as the permission resource identifier */
export type ImportPermissionResource = string;

export interface ExcelImportConfig<TRow = Record<string, unknown>> {
  moduleKey: ImportPermissionResource;
  /** Human-readable display name shown in the dialog title/description */
  displayName: string;
  /**
   * Entity name used as the `entity` field in ImportLog.
   * Should be the Prisma model name, e.g. 'Category', 'Employee'.
   * Used by the action's fallback log write (all-failed-before-handler case).
   */
  entity: string;
  sheetName: string;
  maxRows?: number;
  columns: ColumnDef[];
  masterValidations?: MasterValidation[];
  rowTransformer?: (flat: Record<string, unknown>) => TRow;
  handler: (rows: TRow[], userId: string, fileName: string) => Promise<ImportConfirmResult>;
}

// ─── Validation results ────────────────────────────────────────────────────

export interface RowError {
  /** 1-indexed: header = row 1, first data row = row 2 */
  row: number;
  field?: string;
  message: string;
}

// ─── Action results ────────────────────────────────────────────────────────

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  validRows: Record<string, unknown>[];
  errors: RowError[];
  errorFileBase64?: string;
}

export interface ImportConfirmResult {
  totalReceived: number;
  created: number;
  failed: number;
  errors: { index: number; data: Record<string, unknown>; error: string }[];
  errorFileBase64?: string;
}
