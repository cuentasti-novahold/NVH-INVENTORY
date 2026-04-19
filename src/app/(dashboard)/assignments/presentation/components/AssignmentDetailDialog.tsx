'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus, RotateCcw, ArrowLeftRight,
  ChevronDown, ChevronUp, X, Loader2,
  Building2, MapPin, UserSearch,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CrudFormDialog } from '@/shared/presentation/components/form-builder/CrudFormDialog';
import { buildAddAssetFormConfig, buildReturnFormConfig, buildTransferFormConfig } from '../forms/assignment-form.config';
import {
  getEmployeeAssignmentsAction,
  getEmployeeAssignmentRowAction,
  createAssignmentAction,
  returnAssignmentAction,
  transferAssignmentAction,
} from '../../actions';
import { searchEmployeesAction } from '@/app/(dashboard)/employees/actions';
import type {
  EmployeeAssignmentRow,
  AssignmentRow,
  ReturnAssignmentDTO,
  TransferAssignmentDTO,
} from '../dto/assignment.dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

// ─── Generic Autocomplete ────────────────────────────────────────────────────

interface AutocompleteProps {
  onSelect: (code: string, value: string) => void;
  searchFn: (q: string) => Promise<{ ok: boolean; data?: { code: string; value: string }[] }>;
  placeholder?: string;
  reset?: number;
  inputClassName?: string;
  autoFocus?: boolean;
}

function Autocomplete({ onSelect, searchFn, placeholder, reset, inputClassName, autoFocus }: AutocompleteProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<{ code: string; value: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQuery(''); setOptions([]); }, [reset]);

  function onChange(v: string) {
    setQuery(v);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (v.trim().length < 1) { setOptions([]); return; }
      setLoading(true);
      searchFn(v.trim())
        .then((r) => setOptions(r.ok && r.data ? r.data : []))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 250);
  }

  function pick(opt: { code: string; value: string }) {
    setQuery(opt.value);
    setOpen(false);
    onSelect(opt.code, opt.value);
  }

  return (
    <div className="relative">
      <Input
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => query.length >= 1 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={cn('h-9 text-sm bg-background', inputClassName)}
      />
      {open && (options.length > 0 || loading) && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {loading
            ? <li className="px-3 py-2 text-xs text-muted-foreground">Buscando...</li>
            : options.map((opt) => (
              <li
                key={opt.code}
                className="cursor-pointer px-3 py-2 text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt)}
              >
                {opt.value}
              </li>
            ))
          }
        </ul>
      )}
    </div>
  );
}

// ─── History badge ────────────────────────────────────────────────────────────

function HistoryBadge({ status }: { status: 'RETURNED' | 'TRANSFERRED' }) {
  return status === 'RETURNED'
    ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">Devuelto</span>
    : <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600">Transferido</span>;
}

// ─── AssignmentDetailDialog ─────────────────────────────────────────────────

interface AssignmentDetailDialogProps {
  /** null = create mode (employee picker embedded in header) */
  employee: EmployeeAssignmentRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  canAdmin: boolean;
}

export function AssignmentDetailDialog({ employee, open, onOpenChange, canAdmin }: AssignmentDetailDialogProps) {
  const router = useRouter();
  const isCreateMode = employee === null;

  const [internalEmployee, setInternalEmployee] = useState<EmployeeAssignmentRow | null>(employee);
  const [active, setActive] = useState<AssignmentRow[]>([]);
  const [history, setHistory] = useState<AssignmentRow[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFormKey, setAddFormKey] = useState(0);
  const [employeeReset, setEmployeeReset] = useState(0);
  const addAssetFormConfig = buildAddAssetFormConfig();
  const [pending, startTransition] = useTransition();
  const [returnTarget, setReturnTarget] = useState<AssignmentRow | null>(null);
  const [transferTarget, setTransferTarget] = useState<AssignmentRow | null>(null);

  async function loadDetail(employeeId: string) {
    setLoadingDetail(true);
    const r = await getEmployeeAssignmentsAction(employeeId);
    if (r.ok) { setActive(r.data.active); setHistory(r.data.history); }
    setLoadingDetail(false);
  }

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setInternalEmployee(null);
        setActive([]);
        setHistory([]);
        setShowAddForm(false);
        setShowHistory(false);
      }, 150);
      return () => clearTimeout(t);
    }

    setInternalEmployee(employee);
    setShowAddForm(false);
    setShowHistory(false);
    setActive([]);
    setHistory([]);
    setEmployeeReset((n) => n + 1);

    if (employee) {
      loadDetail(employee.employeeId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee]);

  async function handleSelectEmployee(code: string, value: string) {
    const parts = value.split(' — ');
    const name = parts[0]?.trim() ?? value;
    const email = parts[1]?.trim() ?? '';

    setLoadingEmployee(true);

    const [empResult, assignResult] = await Promise.all([
      getEmployeeAssignmentRowAction(code),
      getEmployeeAssignmentsAction(code),
    ]);

    setLoadingEmployee(false);

    if (!empResult.ok || !assignResult.ok) {
      toast.error('No se pudo cargar el empleado');
      return;
    }

    const totalAssignments = assignResult.data.active.length + assignResult.data.history.length;

    if (totalAssignments > 0) {
      // Employee already in assignments table — block and guide
      toast.error(
        `${name} ya tiene asignaciones registradas. Cerrá este modal y usá "Ver activos" en su fila de la tabla.`,
        { duration: 5000 },
      );
      setEmployeeReset((n) => n + 1); // clear autocomplete
      return;
    }

    // First-time assignment — proceed
    setInternalEmployee(empResult.data ?? {
      employeeId: code, employeeName: name, employeeEmail: email,
      employeeDepartment: null, employeeLocation: null,
      activeCount: 0, lastAssignedAt: null, lastReturnedAt: null,
    });
    setActive(assignResult.data.active);
    setHistory(assignResult.data.history);
    setShowAddForm(true);
  }

  function resetAddForm() {
    setShowAddForm(false);
    setAddFormKey((k) => k + 1);
  }

  function handleAdd(data: Record<string, unknown>) {
    if (!internalEmployee) { toast.error('Seleccioná un empleado'); return; }
    startTransition(async () => {
      const r = await createAssignmentAction({
        assetId: data.assetId as string,
        employeeId: internalEmployee.employeeId,
        notes: (data.notes as string) || null,
      });
      if (r.ok) {
        toast.success('Activo asignado');
        if (isCreateMode) {
          onOpenChange(false);
        } else {
          resetAddForm();
          await loadDetail(internalEmployee.employeeId);
        }
        router.refresh();
      } else {
        toast.error(r.message);
      }
    });
  }

  function handleReturn(row: AssignmentRow, dto: ReturnAssignmentDTO) {
    if (!internalEmployee) return;
    startTransition(async () => {
      const r = await returnAssignmentAction(row.id, dto);
      if (r.ok) {
        toast.success('Activo devuelto');
        setReturnTarget(null);
        await loadDetail(internalEmployee.employeeId);
        router.refresh();
      } else { toast.error(r.message); }
    });
  }

  function handleTransfer(row: AssignmentRow, dto: TransferAssignmentDTO) {
    if (!internalEmployee) return;
    startTransition(async () => {
      const r = await transferAssignmentAction(row.id, dto);
      if (r.ok) {
        toast.success('Activo transferido');
        setTransferTarget(null);
        await loadDetail(internalEmployee.employeeId);
        router.refresh();
      } else { toast.error(r.message); }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex flex-col gap-0 p-0 w-[min(96vw,_880px)] sm:max-w-[880px] max-h-[90vh] overflow-hidden rounded-xl">

          {/* ── Header ──────────────────────────────────────────────────────
            * Create mode (no employee): employee search embedded in header.
            * Detail mode (employee resolved): employee identity + badges.
            */}
          <div className="flex items-start gap-4 px-6 py-5 pr-16 shrink-0">
            {isCreateMode && internalEmployee === null ? (
              /* Create mode header: search input */
              <>
                <div className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
                  loadingEmployee ? 'bg-primary/10' : 'bg-muted',
                )}>
                  {loadingEmployee
                    ? <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    : <UserSearch className="h-5 w-5 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1 min-w-0 pt-0.5 space-y-2">
                  <DialogTitle className="text-base font-semibold tracking-tight">
                    Nueva asignación
                  </DialogTitle>
                  <Autocomplete
                    searchFn={searchEmployeesAction as (q: string) => Promise<{ ok: boolean; data?: { code: string; value: string }[] }>}
                    placeholder="Buscá al empleado por nombre o email…"
                    onSelect={handleSelectEmployee}
                    reset={employeeReset}
                    inputClassName="h-10"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Solo empleados sin asignaciones previas. Para empleados ya registrados, usá &quot;Ver activos&quot; en la tabla.
                  </p>
                </div>
              </>
            ) : (
              /* Detail mode header: resolved employee identity */
              <>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary tracking-wide">
                  {internalEmployee ? initials(internalEmployee.employeeName) : '…'}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <DialogTitle className="text-base font-semibold leading-tight tracking-tight">
                    {internalEmployee?.employeeName ?? ''}
                  </DialogTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground truncate">
                    {internalEmployee?.employeeEmail ?? ''}
                  </p>
                  {(internalEmployee?.employeeDepartment || internalEmployee?.employeeLocation) && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {internalEmployee.employeeDepartment && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/8 px-2 py-1 text-[11px] font-medium text-primary">
                          <Building2 className="h-3 w-3" />
                          {internalEmployee.employeeDepartment}
                        </span>
                      )}
                      {internalEmployee.employeeLocation && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {internalEmployee.employeeLocation}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="h-px bg-border shrink-0" />

          {/* ── Scrollable body ─────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-6 py-5 space-y-5">

              {/* Section toolbar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Activos asignados
                  </span>
                  {active.length > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary/10 text-primary text-[11px] font-bold px-1.5">
                      {active.length}
                    </span>
                  )}
                </div>
                {/* "Agregar activo" only visible once an employee is resolved */}
                {canAdmin && internalEmployee !== null && (
                  <Button
                    size="sm"
                    variant={showAddForm ? 'outline' : 'default'}
                    className="h-8 gap-2 text-xs px-3 transition-all duration-200"
                    onClick={() => showAddForm ? resetAddForm() : setShowAddForm(true)}
                  >
                    {showAddForm
                      ? <><X className="h-3.5 w-3.5" />Cancelar</>
                      : <><Plus className="h-3.5 w-3.5" />Agregar activo</>
                    }
                  </Button>
                )}
              </div>

              {/* No employee selected yet (create mode, no selection) */}
              {isCreateMode && internalEmployee === null && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 gap-3">
                  {loadingEmployee
                    ? <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                    : (
                      <>
                        <UserSearch className="h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground text-center max-w-[280px]">
                          Buscá y seleccioná un empleado arriba para comenzar la asignación.
                        </p>
                      </>
                    )
                  }
                </div>
              )}

              {/* Inline add form — animated expand/collapse */}
              {internalEmployee !== null && (
                <div
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    showAddForm ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none',
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="rounded-lg border border-border bg-muted/30 mb-1">
                      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                        <Plus className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium text-foreground">Asignar activo</span>
                      </div>
                      <div className="px-4 py-3">
                        <CrudFormDialog
                          key={addFormKey}
                          open={false}
                          onOpenChange={() => {}}
                          title=""
                          formConfig={addAssetFormConfig}
                          defaultValues={{ assetId: '', notes: '' }}
                          isLoading={pending}
                          onSubmit={handleAdd}
                          noDialogShell
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Active assets table */}
              {internalEmployee !== null && (
                loadingDetail ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando activos…
                  </div>
                ) : active.length === 0 && !showAddForm ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 gap-2">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Sin activos asignados</p>
                    <p className="text-xs text-muted-foreground">Usá el botón de arriba para asignar el primer activo.</p>
                  </div>
                ) : active.length > 0 ? (
                  <div className="overflow-auto max-h-[320px] rounded-lg border border-border">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur-sm">
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Activo</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Asignado</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Entregado por</th>
                          {canAdmin && (
                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Acciones</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border bg-background">
                        {active.map((row) => (
                          <tr key={row.id} className="hover:bg-muted/20 transition-colors duration-100">
                            <td className="px-4 py-3">
                              <span className="block font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                                {row.assetCode}
                              </span>
                              <span className="block text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                                {row.assetLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                              {formatDate(row.assignedAt)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="block text-sm text-muted-foreground truncate max-w-[160px]">
                                {row.deliveredByName ?? '—'}
                              </span>
                            </td>
                            {canAdmin && (
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setReturnTarget(row)}
                                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 whitespace-nowrap"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Devolver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTransferTarget(row)}
                                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 whitespace-nowrap"
                                  >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                    Transferir
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null
              )}

              {/* History */}
              {history.length > 0 && (
                <div className="border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={() => setShowHistory((v) => !v)}
                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors duration-150"
                  >
                    {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    <span>Historial de activos</span>
                    <span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-muted text-muted-foreground text-[10px] font-semibold px-1">
                      {history.length}
                    </span>
                  </button>

                  <div
                    className={cn(
                      'grid transition-all duration-300 ease-out mt-3',
                      showHistory ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="overflow-auto max-h-[220px] rounded-lg border border-border opacity-80">
                        <table className="w-full text-xs border-collapse">
                          <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur-sm">
                            <tr className="border-b border-border">
                              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground tracking-wide">Activo</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Estado</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Asignado</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground tracking-wide whitespace-nowrap">Cerrado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border bg-background">
                            {history.map((row) => (
                              <tr key={row.id} className="opacity-75 hover:opacity-100 transition-opacity duration-100">
                                <td className="px-4 py-2.5">
                                  <span className="block font-mono text-[11px] text-muted-foreground whitespace-nowrap">{row.assetCode}</span>
                                  <span className="block text-[11px] text-muted-foreground/60 truncate max-w-[160px]">{row.assetLabel}</span>
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap">
                                  <HistoryBadge status={row.status as 'RETURNED' | 'TRANSFERRED'} />
                                </td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(row.assignedAt)}</td>
                                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDate(row.returnedAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return dialog */}
      <CrudFormDialog
        open={returnTarget !== null}
        onOpenChange={(v) => { if (!v) setReturnTarget(null); }}
        title={returnTarget ? `Devolver: ${returnTarget.assetCode}` : 'Devolver activo'}
        formConfig={buildReturnFormConfig()}
        defaultValues={{ notes: '' }}
        isLoading={pending}
        onSubmit={(values) => { if (returnTarget) handleReturn(returnTarget, values as ReturnAssignmentDTO); }}
      />

      {/* Transfer dialog */}
      <CrudFormDialog
        open={transferTarget !== null}
        onOpenChange={(v) => { if (!v) setTransferTarget(null); }}
        title={transferTarget ? `Transferir: ${transferTarget.assetCode}` : 'Transferir activo'}
        formConfig={buildTransferFormConfig({})}
        defaultValues={{ newEmployeeId: '', notes: '' }}
        isLoading={pending}
        onSubmit={(values) => { if (transferTarget) handleTransfer(transferTarget, values as unknown as TransferAssignmentDTO); }}
      />
    </>
  );
}
