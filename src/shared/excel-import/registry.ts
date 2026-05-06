import type { ExcelImportConfig } from './types';

// Internal registry — populated by explicit register() calls from module configs.
// Starts empty in PR1a. Module registrations happen in PR2 (T-13).
const registry = new Map<string, ExcelImportConfig<unknown>>();

/**
 * Register a module import config.
 * Call once per module, typically at the top of registry.ts after PR2 wires it.
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
