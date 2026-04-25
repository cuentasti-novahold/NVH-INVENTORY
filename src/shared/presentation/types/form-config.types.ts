import type { LucideIcon } from 'lucide-react';

export type FieldVisibility = 'required' | 'optional' | 'hidden';

export interface CascadeConfig {
  cascadeAction: (selectedValue: string) => Promise<Record<string, unknown>>;
}

export interface VisibilityValueBased {
  field: string;
  values?: unknown[];
  notValues?: unknown[];
}

export interface VisibilityServerAction {
  field: string;
  serverAction: (value: unknown) => Promise<Record<string, FieldVisibility>>;
}

export interface AutocompleteConfig {
  searchAction: (query: string, watchedValue?: string) => Promise<AutocompleteOption[]>;
  returnMode: 'code' | 'value' | 'both';
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
  initialDisplayValue?: string;
  initialDisplayValueField?: string;
  /** Field name whose current value is passed as second arg to searchAction and disables this field when empty */
  watchField?: string;
  cascade?: CascadeConfig;
}

export interface AutocompleteOption {
  code: string;
  value: string;
  meta?: Record<string, unknown>;
}

export interface PresetOption {
  value: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  accent: string;
  accentBg: string;
  fields: string;
}

export interface PresetSelectorConfig {
  presets: PresetOption[];
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'boolean'
    | 'textarea'
    | 'date'
    | 'uuid'
    | 'autocomplete'
    | 'checkbox'
    | 'switch'
    | 'datetime-local'
    | 'preset-selector'
    | 'readonly'
    | 'status-select'
    | 'hidden';
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  defaultValue?: unknown;
  placeholder?: string;
  options?: { label: string; value: string; color?: string }[];
  pattern?: { regex: string; message: string };
  hidden?: boolean;
  gridCols?: 1 | 2 | 3 | 4;
  autocompleteConfig?: AutocompleteConfig;
  presetSelectorConfig?: PresetSelectorConfig;
  format?: (value: unknown) => string;
  visibilityDependsOn?: VisibilityValueBased | VisibilityServerAction;
}

export interface FormSection {
  title: string;
  description?: string;
  icon?: LucideIcon;
  accent?: string;
  fields: FormFieldConfig[];
}

export interface FormConfig {
  fields: FormFieldConfig[];
  sections?: FormSection[];
}
