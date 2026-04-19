import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('xlsx', () => ({
  read: vi.fn().mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
  }),
  utils: {
    sheet_to_json: vi.fn().mockReturnValue([{ name: 'Item A', qty: 1 }]),
  },
}));

import { ExcelImportDialog } from '../ExcelImportDialog';
import * as xlsx from 'xlsx';

const defaultAction = vi.fn().mockResolvedValue({
  inserted: 1,
  skipped: 0,
  errors: [],
});

describe('ExcelImportDialog', () => {
  beforeEach(() => {
    defaultAction.mockClear();
    vi.mocked(xlsx.read).mockClear();
    vi.mocked(xlsx.utils.sheet_to_json).mockClear();
  });

  it('shows file input in idle state when open', () => {
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );
    expect(screen.getByLabelText(/archivo excel/i)).toBeInTheDocument();
  });

  it('transitions to preview state after file selection', async () => {
    const user = userEvent.setup();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );

    const file = new File(['dummy'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const input = screen.getByLabelText(/archivo excel/i);

    await act(async () => {
      await user.upload(input, file);
    });

    await waitFor(() => {
      const matches = screen.getAllByText(/1 filas/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows Importar N filas button in preview state', async () => {
    const user = userEvent.setup();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = screen.getByLabelText(/archivo excel/i);
    await act(async () => { await user.upload(input, file); });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /importar 1 filas/i })).toBeInTheDocument();
    });
  });

  it('calls action and transitions to done on submit', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
        onSuccess={onSuccess}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = screen.getByLabelText(/archivo excel/i);
    await act(async () => { await user.upload(input, file); });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /importar/i })).toBeInTheDocument();
    });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /importar 1 filas/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(/importación completada/i)).toBeInTheDocument();
    });
    expect(onSuccess).toHaveBeenCalledWith({ inserted: 1, skipped: 0, errors: [] });
  });

  it('transitions to error state when action rejects', async () => {
    const user = userEvent.setup();
    const failingAction = vi.fn().mockRejectedValue(new Error('Server error'));
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={failingAction}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = screen.getByLabelText(/archivo excel/i);
    await act(async () => { await user.upload(input, file); });
    await waitFor(() => screen.getByRole('button', { name: /importar/i }));
    await act(async () => { await user.click(screen.getByRole('button', { name: /importar 1 filas/i })); });
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument();
    });
  });

  it('Cancelar in preview returns to idle state', async () => {
    const user = userEvent.setup();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = screen.getByLabelText(/archivo excel/i);
    await act(async () => { await user.upload(input, file); });
    await waitFor(() => screen.getByRole('button', { name: /cancelar/i }));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(screen.getByLabelText(/archivo excel/i)).toBeInTheDocument();
  });

  it('calls onOpenChange(false) after successful import', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={onOpenChange}
        action={defaultAction}
        onSuccess={onSuccess}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await act(async () => { await user.upload(screen.getByLabelText(/archivo excel/i), file); });
    await waitFor(() => screen.getByRole('button', { name: /importar 1 filas/i }));
    await act(async () => { await user.click(screen.getByRole('button', { name: /importar 1 filas/i })); });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables confirm button when expectedColumns are missing', async () => {
    const user = userEvent.setup();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
        expectedColumns={['name', 'qty', 'missingField']}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await act(async () => { await user.upload(screen.getByLabelText(/archivo excel/i), file); });
    await waitFor(() => screen.getByRole('button', { name: /importar/i }));
    expect(screen.getByRole('button', { name: /importar 1 filas/i })).toBeDisabled();
    expect(screen.getByText(/columnas faltantes/i)).toBeInTheDocument();
  });

  it('shows Cerrar button in done state', async () => {
    const user = userEvent.setup();
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );
    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = screen.getByLabelText(/archivo excel/i);
    await act(async () => { await user.upload(input, file); });
    await waitFor(() => screen.getByRole('button', { name: /importar 1 filas/i }));
    await act(async () => { await user.click(screen.getByRole('button', { name: /importar 1 filas/i })); });
    await waitFor(() => screen.getByRole('button', { name: /cerrar/i }));
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeInTheDocument();
  });

  it('resets to idle when dialog is reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );

    const file = new File(['dummy'], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = screen.getByLabelText(/archivo excel/i);
    await act(async () => { await user.upload(input, file); });
    await waitFor(() => screen.getByRole('button', { name: /importar/i }));

    // Close then reopen
    rerender(
      <ExcelImportDialog open={false} onOpenChange={vi.fn()} action={defaultAction} />,
    );
    rerender(
      <ExcelImportDialog open={true} onOpenChange={vi.fn()} action={defaultAction} />,
    );

    // Should be back to idle
    expect(screen.getByLabelText(/archivo excel/i)).toBeInTheDocument();
  });

  it('shows Spanish strings', () => {
    render(
      <ExcelImportDialog
        open={true}
        onOpenChange={vi.fn()}
        action={defaultAction}
      />,
    );
    expect(screen.getByText(/importar desde excel/i)).toBeInTheDocument();
  });
});
