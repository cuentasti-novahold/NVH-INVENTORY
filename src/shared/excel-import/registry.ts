import type { ExcelImportConfig } from './types';
import { categoriesImportConfig } from '@/app/(dashboard)/settings/categories/import/config';
import { employeesImportConfig } from '@/app/(dashboard)/employees/import/config';
import { assetsImportConfig } from '@/app/(dashboard)/assets/import/config';

// Internal registry — populated by explicit register() calls from module configs.
const registry = new Map<string, ExcelImportConfig<unknown>>();

/**
 * Register a module import config.
 * Call once per module at module load time.
 */
export function register(config: ExcelImportConfig<unknown>): void {
  registry.set(config.moduleKey, config);
}

/**
 * Retrieve a registered config by moduleKey.
 * Throws a Spanish error when the key is not registered.
 */
export function getImportConfig(moduleKey: string): ExcelImportConfig<unknown> {
  const cfg = registry.get(moduleKey);
  if (!cfg) {
    throw new Error(`No existe configuración de importación para el módulo "${moduleKey}"`);
  }
  return cfg;
}

// ─── Module registrations ──────────────────────────────────────────────────
register(categoriesImportConfig as ExcelImportConfig<unknown>);
register(employeesImportConfig as ExcelImportConfig<unknown>);
register(assetsImportConfig as ExcelImportConfig<unknown>);
