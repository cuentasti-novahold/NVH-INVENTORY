export type ExcelImportState =
  | 'idle'
  | 'preview'
  | 'uploading'
  | 'done'
  | 'error';

export interface ExcelRowError {
  row: number;
  field?: string;
  message: string;
}

export interface ExcelImportResult {
  inserted: number;
  skipped: number;
  errors: ExcelRowError[];
}
