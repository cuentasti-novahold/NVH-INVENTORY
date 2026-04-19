import { describe, it, expectTypeOf } from 'vitest';
import type {
  ExcelImportState,
  ExcelRowError,
  ExcelImportResult,
} from '../excel-import.types';

describe('excel-import.types', () => {
  it('ExcelImportState covers all 5 states', () => {
    const states: ExcelImportState[] = [
      'idle',
      'preview',
      'uploading',
      'done',
      'error',
    ];
    expect(states).toHaveLength(5);
  });

  it('ExcelImportResult has inserted, skipped and errors fields', () => {
    const result: ExcelImportResult = {
      inserted: 10,
      skipped: 2,
      errors: [],
    };
    expect(result.inserted).toBe(10);
    expect(result.skipped).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it('ExcelRowError has row, message and optional field', () => {
    const err: ExcelRowError = { row: 1, message: 'error msg' };
    expect(err.row).toBe(1);
    expect(err.message).toBe('error msg');
    expect(err.field).toBeUndefined();

    const errWithField: ExcelRowError = { row: 2, field: 'name', message: 'required' };
    expect(errWithField.field).toBe('name');
  });

  it('ExcelImportResult does NOT have insertedCount field', () => {
    const result: ExcelImportResult = { inserted: 5, skipped: 0, errors: [] };
    expectTypeOf(result).not.toHaveProperty('insertedCount' as never);
  });
});
