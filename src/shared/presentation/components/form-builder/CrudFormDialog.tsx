'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm, type UseFormRegister, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type {
  FormConfig,
  FormFieldConfig,
  AutocompleteOption,
  PresetOption,
  FieldVisibility,
  VisibilityServerAction,
} from '@/shared/presentation/types/form-config.types';

type FormValues = Record<string, unknown>;
type FieldContext = {
  field: FormFieldConfig;
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  setValue: UseFormSetValue<FormValues>;
  cascadeLoadingField?: string | null;
  cascadeOptions?: Record<string, { label: string; value: string }[]>;
};

/* ─── ReadonlyField ───────────────────────────────────────────── */

function ReadonlyField({ field, watch }: FieldContext) {
  const value = watch(field.name);
  const display = field.format ? field.format(value) : (value != null ? String(value) : '—');
  return (
    <p className="flex h-9 w-full items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground select-none">
      {display}
    </p>
  );
}

/* ─── StatusSelectField ───────────────────────────────────────── */

function StatusSelectField({ field, watch, setValue }: FieldContext) {
  const current = (watch(field.name) as string) ?? '';
  const opts = field.options ?? [];
  const selected = opts.find((o) => o.value === current);
  return (
    <Select value={current} onValueChange={(v) => setValue(field.name, v)}>
      <SelectTrigger id={field.name} className="h-9">
        <div className="flex items-center gap-2">
          {selected?.color && <span className={cn('h-2 w-2 rounded-full shrink-0', selected.color)} />}
          <SelectValue placeholder={field.placeholder ?? `Seleccionar ${field.label}`} />
        </div>
      </SelectTrigger>
      <SelectContent>
        {opts.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <div className="flex items-center gap-2">
              {opt.color && <span className={cn('h-2 w-2 rounded-full shrink-0', opt.color)} />}
              {opt.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ─── PresetSelectorField ─────────────────────────────────────── */

function PresetSelectorField({ field, watch, setValue }: FieldContext) {
  const presets = field.presetSelectorConfig?.presets ?? [];
  const current = watch(field.name) as string | undefined;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {presets.map((preset: PresetOption) => {
        const Icon = preset.icon;
        const selected = current === preset.value;
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => setValue(field.name, preset.value)}
            className={cn(
              'relative flex items-start gap-3 rounded-lg border p-3.5 text-left transition-all duration-150',
              'hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-background',
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                selected ? preset.accentBg : 'bg-muted',
              )}
            >
              <Icon
                className={cn('h-4 w-4', selected ? 'text-white' : 'text-muted-foreground')}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold leading-tight text-foreground">
                {preset.label}
              </span>
              <span className="text-[11px] text-muted-foreground">{preset.sub}</span>
              <span
                className={cn(
                  'mt-1.5 text-[10px] font-medium uppercase tracking-wide',
                  selected ? preset.accent : 'text-muted-foreground/60',
                )}
              >
                {preset.fields}
              </span>
            </div>

            {selected && (
              <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── AutocompleteField ───────────────────────────────────────── */
/* key prop on this component (passed from renderField) resets     */
/* local state when initialDisplayValue changes — no useEffect.    */

interface AutocompleteFieldProps extends FieldContext {
  onCascadeStart?: (fieldName: string) => void;
  onCascadeEnd?: () => void;
  onCascadeResult?: (result: Record<string, unknown>) => void;
  disabled?: boolean;
}

function AutocompleteField({ field, watch, setValue, onCascadeStart, onCascadeEnd, onCascadeResult, disabled }: AutocompleteFieldProps) {
  const cfg = field.autocompleteConfig!;
  const minChars = cfg.minChars ?? 2;
  const debounceMs = cfg.debounceMs ?? 250;

  const currentValue = watch(field.name) as string | undefined;
  const [query, setQuery] = useState<string>(cfg.initialDisplayValue ?? '');
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function calcPosition() {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }

  function runSearch(q: string) {
    if (q.trim().length < minChars) { setOptions([]); return; }
    setLoading(true);
    cfg.searchAction(q.trim())
      .then((opts) => setOptions(opts))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }

  function onChange(v: string) {
    setQuery(v);
    calcPosition();
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(v), debounceMs);
    if (currentValue) setValue(field.name, '');
  }

  function onFocus() {
    calcPosition();
    if (query.length >= minChars) setOpen(true);
  }

  async function pick(opt: AutocompleteOption) {
    const store =
      cfg.returnMode === 'code' ? opt.code
      : cfg.returnMode === 'value' ? opt.value
      : JSON.stringify({ code: opt.code, value: opt.value });
    setValue(field.name, store);
    setQuery(opt.value);
    setOpen(false);

    if (cfg.cascade) {
      onCascadeStart?.(field.name);
      try {
        const result = await cfg.cascade.cascadeAction(store);
        onCascadeResult?.(result);
      } catch {
        toast.error('Error al cargar datos relacionados');
      } finally {
        onCascadeEnd?.();
      }
    }
  }

  const dropdown = open && (options.length > 0 || loading)
    ? createPortal(
        <ul
          style={dropdownStyle}
          className="max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg ring-1 ring-foreground/5"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Buscando...</li>
          )}
          {!loading && options.map((opt) => (
            <li
              key={opt.code}
              className="cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(opt)}
            >
              {opt.value}
            </li>
          ))}
        </ul>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={field.name}
        autoComplete="off"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={cfg.placeholder ?? field.label}
        className="h-9"
        disabled={disabled}
      />
      {loading && (
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        </div>
      )}
      {dropdown}
    </div>
  );
}

/* ─── ToggleSwitch ────────────────────────────────────────────── */

function ToggleSwitch({ field, watch, setValue }: FieldContext) {
  const checked = Boolean(watch(field.name));
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => setValue(field.name, !checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-input'
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition-transform',
        checked ? 'translate-x-4' : 'translate-x-0'
      )} />
    </button>
  );
}

/* ─── Field renderers map ─────────────────────────────────────── */

const FIELD_RENDERERS: Partial<Record<FormFieldConfig['type'], (ctx: FieldContext) => React.ReactNode>> = {
  select: ({ field, watch, setValue }) => (
    <Select
      value={(watch(field.name) as string) ?? ''}
      onValueChange={(v) => setValue(field.name, v)}
    >
      <SelectTrigger id={field.name} className="h-9">
        <SelectValue placeholder={field.placeholder ?? `Seleccionar ${field.label}`} />
      </SelectTrigger>
      <SelectContent>
        {field.options?.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),

  textarea: ({ field, register }) => (
    <textarea
      id={field.name}
      {...register(field.name, { required: field.required ? `${field.label} es requerido` : false })}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      className="min-h-[80px] w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  ),

  boolean: (ctx) => <ToggleSwitch {...ctx} />,
  switch: (ctx) => <ToggleSwitch {...ctx} />,
  checkbox: (ctx) => <ToggleSwitch {...ctx} />,

  // key={initialDisplayValue} on the wrapper div (in renderField) handles sync without useEffect
  autocomplete: (ctx) => <AutocompleteField {...ctx} />,

  'preset-selector': (ctx) => <PresetSelectorField {...ctx} />,

  // T-02: readonly renderer
  'readonly': (ctx) => <ReadonlyField {...ctx} />,

  // T-03: status-select renderer
  'status-select': (ctx) => <StatusSelectField {...ctx} />,
};

const INPUT_TYPE: Partial<Record<FormFieldConfig['type'], string>> = {
  number: 'number',
  date: 'date',
  'datetime-local': 'datetime-local',
};

function renderInputFallback({ field, register }: FieldContext) {
  return (
    <Input
      id={field.name}
      type={INPUT_TYPE[field.type] ?? 'text'}
      placeholder={field.placeholder}
      maxLength={field.maxLength}
      min={field.min}
      max={field.max}
      className="h-9"
      {...register(field.name, {
        required: field.required ? `${field.label} es requerido` : false,
        ...(field.pattern && {
          pattern: { value: new RegExp(field.pattern.regex), message: field.pattern.message },
        }),
      })}
    />
  );
}

const GRID_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'col-span-full',
  2: 'col-span-1',
  3: 'col-span-1',
  4: 'col-span-1',
};

function getFields(config: FormConfig): FormFieldConfig[] {
  return config.sections?.length ? config.sections.flatMap((s) => s.fields) : config.fields;
}

/* ─── CrudFormDialog ──────────────────────────────────────────── */

interface CrudFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  formConfig: FormConfig;
  defaultValues?: FormValues;
  onSubmit: (data: FormValues) => void;
  isLoading?: boolean;
  /** When true, renders the form inline without a Dialog wrapper. `open` prop is ignored. */
  noDialogShell?: boolean;
}

export function CrudFormDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  formConfig,
  defaultValues,
  onSubmit,
  isLoading,
  noDialogShell,
}: CrudFormDialogProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } =
    useForm<FormValues>({ defaultValues: defaultValues ?? {} });

  // T-04: cascade state
  const [cascadeLoadingField, setCascadeLoadingField] = useState<string | null>(null);
  const [cascadeOptions, setCascadeOptions] = useState<Record<string, { label: string; value: string }[]>>({});

  // T-06: server-action visibility state
  const [dynamicVisibility, setDynamicVisibility] = useState<Record<string, FieldVisibility>>({});

  useEffect(() => {
    if (noDialogShell || open) reset(defaultValues ?? {});
  }, [open, defaultValues, reset, noDialogShell]);

  // T-06: collect Mode B configs (server-action based visibility)
  const modeBConfigs = useMemo(() => {
    return getFields(formConfig)
      .filter((f) => f.visibilityDependsOn && 'serverAction' in f.visibilityDependsOn)
      .map((f) => f.visibilityDependsOn as VisibilityServerAction)
      // deduplicate by controlling field name
      .filter((cfg, idx, arr) => arr.findIndex((c) => c.field === cfg.field) === idx);
  }, [formConfig]);

  // T-06: watch all Mode B controlling fields together
  const controllingValues = modeBConfigs.map((c) => watch(c.field));

  useEffect(() => {
    if (modeBConfigs.length === 0) return;
    const updates: Record<string, FieldVisibility> = {};
    Promise.all(
      modeBConfigs.map(async (cfg, i) => {
        const val = controllingValues[i];
        if (!val) return;
        try {
          const result = await cfg.serverAction(val);
          Object.assign(updates, result);
        } catch {
          toast.error('Error al cargar configuración de campos');
        }
      })
    ).then(() => {
      if (Object.keys(updates).length > 0) setDynamicVisibility(updates);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllingValues.join(',')]);

  // T-04: cascade result handler
  function handleCascadeResult(result: Record<string, unknown>) {
    for (const [key, val] of Object.entries(result)) {
      if (key.startsWith('_cascadeOptions_')) {
        const targetField = key.replace('_cascadeOptions_', '');
        setCascadeOptions((prev) => ({ ...prev, [targetField]: val as { label: string; value: string }[] }));
      } else {
        setValue(key, val);
      }
    }
  }

  // T-05: Mode A visibility check (value-based, synchronous)
  function isVisibleModeA(field: FormFieldConfig): boolean {
    const vd = field.visibilityDependsOn;
    if (!vd || 'serverAction' in vd) return true;
    const controlValue = watch(vd.field);
    const inValues = vd.values ? vd.values.includes(controlValue) : true;
    const notInNotValues = vd.notValues ? !vd.notValues.includes(controlValue) : true;
    return inValues && notInNotValues;
  }

  const renderField = (field: FormFieldConfig) => {
    // Hidden inputs: register with RHF so cascade values are submitted
    if (field.type === 'hidden') {
      return <input key={field.name} type="hidden" {...register(field.name)} />;
    }

    if (field.hidden) return null;

    // T-05: Mode A visibility
    if (!isVisibleModeA(field)) return null;

    // T-06: Mode B visibility
    if (dynamicVisibility[field.name] === 'hidden') return null;

    // Cascade-driven select: hide when options list is empty
    if (field.type === 'select' && field.name in cascadeOptions && cascadeOptions[field.name].length === 0) {
      return null;
    }

    const isCascadeLoading = cascadeLoadingField !== null;
    const isAutocompleteDisabled = isCascadeLoading && field.type === 'autocomplete';

    const ctx: FieldContext = { field, register, watch, setValue, cascadeLoadingField, cascadeOptions };
    const isToggle = field.type === 'boolean' || field.type === 'switch' || field.type === 'checkbox';
    const isWide = field.type === 'preset-selector';
    const error = errors[field.name]?.message as string | undefined;

    // Build the field element
    let fieldElement: React.ReactNode;

    if (field.type === 'autocomplete') {
      fieldElement = (
        // key on wrapper syncs display state when editing different records (no useEffect)
        <div key={field.autocompleteConfig?.initialDisplayValue ?? field.name}>
          <AutocompleteField
            field={field}
            register={register}
            watch={watch}
            setValue={setValue}
            onCascadeStart={setCascadeLoadingField}
            onCascadeEnd={() => setCascadeLoadingField(null)}
            onCascadeResult={handleCascadeResult}
            disabled={isAutocompleteDisabled}
          />
        </div>
      );
    } else if (field.type === 'select' && cascadeOptions[field.name]) {
      // Use cascade-driven options for select fields
      const mergedField = { ...field, options: cascadeOptions[field.name] };
      const renderer = FIELD_RENDERERS['select']!;
      fieldElement = renderer({ ...ctx, field: mergedField });
    } else {
      const renderer = FIELD_RENDERERS[field.type] ?? renderInputFallback;
      if (isToggle) {
        fieldElement = (
          <div className="flex items-center gap-2.5 py-1.5">
            {renderer(ctx)}
            <span className="text-sm text-muted-foreground">
              {Boolean(watch(field.name)) ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        );
      } else {
        fieldElement = renderer(ctx);
      }
    }

    return (
      <div
        key={field.name}
        className={cn(
          'flex flex-col gap-1.5',
          isWide ? 'col-span-2' : GRID_CLASS[field.gridCols ?? 1],
        )}
      >
        {!isWide && field.label && (
          <Label
            htmlFor={field.name}
            className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {field.label}
            {field.required && <span className="text-destructive ml-1 normal-case">*</span>}
          </Label>
        )}

        {fieldElement}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  // T-08: check if all fields in a section are hidden
  function isSectionAllHidden(sectionFields: FormFieldConfig[]): boolean {
    return sectionFields.every((f) => {
      if (f.hidden) return true;
      if (dynamicVisibility[f.name] === 'hidden') return true;
      if (!isVisibleModeA(f)) return true;
      return false;
    });
  }

  const renderBody = () => {
    if (formConfig.sections?.length) {
      return formConfig.sections.map((section) => {
        // T-08: suppress empty sections
        if (isSectionAllHidden(section.fields)) return null;

        const SectionIcon = section.icon;
        return (
          <div key={section.title} className="space-y-4">
            {/* Section header — with optional icon */}
            <div className="flex items-center gap-2">
              {SectionIcon && (
                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded',
                    section.accent ?? 'bg-muted',
                  )}
                >
                  <SectionIcon className="h-3 w-3 text-white" />
                </div>
              )}
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                {section.title}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {section.description && (
              <p className="text-xs text-muted-foreground -mt-2">{section.description}</p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5">
              {section.fields.map(renderField)}
            </div>
          </div>
        );
      });
    }

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5">
        {getFields(formConfig).map(renderField)}
      </div>
    );
  };

  // T-08: exclude readonly and hidden-by-visibility fields from submit
  function handleFormSubmit(data: FormValues) {
    const readonlyNames = new Set(
      getFields(formConfig).filter((f) => f.type === 'readonly').map((f) => f.name)
    );
    const hiddenByVisibility = new Set(
      getFields(formConfig)
        .filter((f) => dynamicVisibility[f.name] === 'hidden')
        .map((f) => f.name)
    );
    const hiddenByModeA = new Set(
      getFields(formConfig)
        .filter((f) => !isVisibleModeA(f))
        .map((f) => f.name)
    );
    const filtered = Object.fromEntries(
      Object.entries(data).filter(
        ([k]) => !readonlyNames.has(k) && !hiddenByVisibility.has(k) && !hiddenByModeA.has(k)
      )
    );
    onSubmit(filtered);
  }

  // T-07: noDialogShell mode — render form without Dialog wrapper
  if (noDialogShell) {
    return (
      <div className="flex flex-col gap-0">
        {title && (
          <h3 className="px-1 pb-4 text-sm font-semibold text-foreground">{title}</h3>
        )}
        {subtitle && (
          <p className="px-1 pb-3 text-xs text-muted-foreground">{subtitle}</p>
        )}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-0">
          <div className="space-y-6">{renderBody()}</div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={isLoading} className="min-w-[96px]">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </span>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-h-[92vh] sm:max-h-[85vh] sm:max-w-xl lg:max-w-2xl flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col px-4 py-4 pr-10 border-b bg-muted/30 shrink-0 sm:px-6 sm:pr-14">
          <DialogTitle className="text-[15px] font-semibold tracking-tight">
            {title}
          </DialogTitle>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 sm:px-6 sm:py-5 sm:space-y-6">
            {renderBody()}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex justify-end gap-2 px-4 py-3 border-t bg-muted/20 sm:px-6 sm:py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="min-w-[88px]">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </span>
              ) : (
                'Guardar'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
