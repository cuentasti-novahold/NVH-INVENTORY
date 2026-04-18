---
name: nextjs-16/form-builder
description: >
  Form building patterns for this Next.js 16 ERP frontend.
  Trigger: When building or modifying forms, adding fields, autocomplete inputs, or sections.
  All forms use a declarative FormConfig consumed by CrudFormDialog — no manual <form> + useState.
license: Apache-2.0
metadata:
  author: pcarlos
  version: "1.1"
  scope: [root, ui]
  auto_invoke: "Building or modifying a form, adding form fields, autocomplete, or CrudFormDialog"
allowed-tools: Read, Edit, Write, Glob, Grep, Bash, WebFetch, WebSearch, Task
---

## Form Decision Tree

```
Simple fields (flat layout)?    → FormConfig with fields: []
Complex form (logical groups)?  → FormConfig with sections: []
Field needs API search?         → type: "autocomplete" + autocompleteConfig
Fixed option list?              → type: "select" + options: [{ label, value }]
True/false toggle?              → type: "boolean" or type: "switch"
```

## Critical Rules

```
NEVER    manual <form> + useState
NEVER    "use client" or "use server" in form config files
ALWAYS   field.name must match the backend DTO field name exactly
ALWAYS   searchAction in autocompleteConfig must be a "use server" Server Action
```

## File Location

```
presentation/forms/{module}-form.config.ts   ← the ONLY file to create
```

The `CrudFormDialog` (shared) renders the fields, runs Zod validation, and handles submit. You only write the config.

---

## FormConfig Types

Source: `@/shared/presentation/types/form-config.types`

```typescript
export interface FormFieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'textarea' | 'date'
      | 'uuid' | 'autocomplete' | 'checkbox' | 'switch' | 'datetime-local';
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  defaultValue?: unknown;
  placeholder?: string;
  options?: { label: string; value: string }[];   // for type: 'select'
  pattern?: { regex: string; message: string };
  hidden?: boolean;
  gridCols?: 1 | 2 | 3 | 4;
  autocompleteConfig?: AutocompleteConfig;         // for type: 'autocomplete'
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FormFieldConfig[];
}

export interface FormConfig {
  fields: FormFieldConfig[];
  sections?: FormSection[];
}
```

---

## Example — flat fields (country)

**File:** `presentation/forms/country-form.config.ts`

```typescript
import type { FormConfig } from "@/shared/presentation/types/form-config.types";
import { searchCurrencies } from "@/app/dashboard/masters/currencies/application/use-cases/currency-search.action";

export const countryFormConfig: FormConfig = {
  fields: [
    { name: "iso_code",      label: "Código ISO (2)",    type: "text",         required: true, maxLength: 3,   placeholder: "CO" },
    { name: "iso_code_3",    label: "Código ISO (3)",    type: "text",         required: true, maxLength: 3,   placeholder: "COL" },
    { name: "name",          label: "Nombre",            type: "text",         required: true, maxLength: 150 },
    { name: "name_en",       label: "Nombre (Inglés)",   type: "text",         maxLength: 150, placeholder: "Colombia" },
    { name: "phone_code",    label: "Código Telefónico", type: "text",         required: true, maxLength: 3,   placeholder: "57" },
    { name: "currency_code", label: "Código Moneda",     type: "text",         required: true, maxLength: 10,  placeholder: "COP" },
    {
      name: "currency_id",
      label: "Moneda",
      type: "autocomplete",
      required: true,
      autocompleteConfig: {
        searchAction: searchCurrencies,
        returnMode: "code",
        placeholder: "Buscar moneda...",
      },
    },
    { name: "flag_emoji", label: "Emoji Bandera", type: "text", maxLength: 10 },
  ],
};
```

---

## Example — sections (third-party)

Use `sections` when the form has logical groups of fields. Set `fields: []` when using sections.

```typescript
import type { FormConfig } from "@/shared/presentation/types/form-config.types";
import { searchPaymentTerms } from "@/app/dashboard/masters/payment-terms/application/use-cases/payment-term-search.action";
import { searchCountries } from "@/app/dashboard/masters/countries/application/use-cases/country-search.action";

export const thirdPartyFormConfig: FormConfig = {
  fields: [],
  sections: [
    {
      title: "Datos principales",
      description: "Identificación y clasificación del tercero",
      fields: [
        {
          name: "type",
          label: "Tipo",
          type: "select",
          required: true,
          options: [
            { label: "Cliente",     value: "customer" },
            { label: "Proveedor",   value: "supplier" },
            { label: "Ambos",       value: "both" },
          ],
          gridCols: 1,
        },
        { name: "tax_id",     label: "NIT / Identificación", type: "text", required: true, maxLength: 30, gridCols: 1 },
        { name: "legal_name", label: "Razón Social",         type: "text", required: true, maxLength: 150, gridCols: 2 },
      ],
    },
    {
      title: "Condición de pago",
      fields: [
        {
          name: "payment_term_id",
          label: "Condición de Pago",
          type: "autocomplete",
          autocompleteConfig: {
            searchAction: searchPaymentTerms,
            returnMode: "code",
            placeholder: "Buscar condición de pago...",
          },
          gridCols: 1,
        },
        {
          name: "address_country_id",
          label: "País",
          type: "autocomplete",
          autocompleteConfig: {
            searchAction: searchCountries,
            returnMode: "code",
            placeholder: "Buscar país...",
          },
          gridCols: 1,
        },
      ],
    },
  ],
};
```

---

## Field Types — Quick Reference

| `type` | When to use | Extra props |
|--------|-------------|-------------|
| `text` | Free text | `maxLength`, `placeholder`, `pattern` |
| `number` | Integers or decimals | `min`, `max`, `defaultValue` |
| `select` | Fixed option list | `options: [{ label, value }]` |
| `boolean` | True/false switch visual | `defaultValue: true` |
| `switch` | Same as `boolean` | `defaultValue: true` |
| `checkbox` | Checkbox | — |
| `textarea` | Long multiline text | `maxLength` |
| `date` | Date picker | — |
| `datetime-local` | Date + time picker | — |
| `autocomplete` | Dynamic API search | `autocompleteConfig` |
| `uuid` | UUID hidden/readonly field | `hidden: true` |

---

## AutocompleteConfig — Full Reference

Source: `@/shared/presentation/types/autocomplete.types`

```typescript
interface AutocompleteConfig {
  searchAction: (query: string) => Promise<AutocompleteOption[]>;  // Server Action
  returnMode: "code" | "value" | "both";
  placeholder?: string;
  minChars?: number;            // minimum chars before search fires (default: 1)
  debounceMs?: number;          // debounce delay in ms (default: 300)
  initialDisplayValue?: string; // text shown when editing an existing record
  initialDisplayValueField?: string;
  onSelect?: (option: AutocompleteOption | null) => void;
}
```

`returnMode`:
- `"code"` — stores `option.code` in the form (the entity ID field).
- `"value"` — stores `option.value` (the display text).
- `"both"` — stores `{ code, value }`.

`AutocompleteOption` shape: `{ code: string, value: string, meta: Record<string, unknown> }`.

---

## Using CrudFormDialog

`CrudFormDialog` is at `@/shared/presentation/components/form-builder/CrudFormDialog`.

```tsx
<CrudFormDialog
  open={dialogOpen.editOpen}
  onOpenChange={(open) => setDialogOpen((prev) => ({ ...prev, editOpen: open }))}
  title={editingItem ? "Editar País" : "Crear País"}
  formConfig={countryFormConfig}
  defaultValues={editingItem ? (editingItem as unknown as Record<string, unknown>) : undefined}
  onSubmit={handleSubmit}
  isLoading={createMutation.isPending || updateMutation.isPending}
/>
```

| Prop | Type | Notes |
|------|------|-------|
| `open` | `boolean` | Controlled open state |
| `onOpenChange` | `(open: boolean) => void` | Close handler |
| `title` | `string` | Dialog title — use Spanish |
| `formConfig` | `FormConfig` | The config object |
| `defaultValues` | `Record<string, unknown> \| undefined` | Pass entity for edit, `undefined` for create |
| `onSubmit` | `(data: Record<string, unknown>) => void` | Receives form values on submit |
| `isLoading` | `boolean` | Disables submit button during mutation |

---

## Rules

1. Never create forms with `useState` + manual `<input>` elements.
2. Form config files have no directive (`"use client"` / `"use server"`) — they are plain TypeScript.
3. `searchAction` in `autocompleteConfig` must be a Server Action (in a `"use server"` file).
4. Field `name` values must match backend DTO field names exactly.
5. `required: true` triggers automatic Zod client-side validation and marks the field visually.
6. Use `gridCols` to control layout: `1` = full width, `2` = half width, etc.
7. When using `sections`, set `fields: []` to avoid mixing the two layouts.
8. All user-facing `label` and `placeholder` values must be in Spanish.
