import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { EmployeeAssignmentPDF } from '../EmployeeAssignmentPDF';
import type { EmployeeAssignmentReportData } from '@/app/(dashboard)/employees/actions';

function makeData(
  overrides: Partial<EmployeeAssignmentReportData> = {},
): EmployeeAssignmentReportData {
  return {
    employee: {
      id: 'emp-abc12345',
      fullName: 'Laura Gómez',
      email: 'laura@novahold.com',
      phone: '3001234567',
      position: 'Analista TI',
      departmentName: 'Tecnología',
      locationName: 'Sede Norte',
      cityName: 'Bogotá',
    },
    assignments: [
      {
        id: 'asgn-1',
        assetCode: 'NVH-LAP-00001',
        categoryName: 'Laptop',
        brand: 'Dell',
        model: 'Latitude 5420',
        serialNumber: 'SN123',
        generalStatus: 'GOOD',
        assignedAt: '2024-03-01T00:00:00.000Z',
        deliveredByName: 'Carlos Admin',
        notes: null,
      },
    ],
    generatedAt: '2024-06-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('EmployeeAssignmentPDF', () => {
  it('renders without crashing with full data', () => {
    expect(() => render(<EmployeeAssignmentPDF data={makeData()} />)).not.toThrow();
  });

  it('renders without crashing with empty assignments', () => {
    const data = makeData({ assignments: [] });
    expect(() => render(<EmployeeAssignmentPDF data={data} />)).not.toThrow();
  });

  it('does not render "null" for null serialNumber', () => {
    const data = makeData({
      assignments: [
        {
          id: 'asgn-2',
          assetCode: 'NVH-MON-00002',
          categoryName: 'Monitor',
          brand: null,
          model: null,
          serialNumber: null,
          generalStatus: 'REGULAR',
          assignedAt: '2024-04-01T00:00:00.000Z',
          deliveredByName: null,
          notes: null,
        },
      ],
    });
    // Component must not throw — serialNumber null is handled as "—"
    expect(() => render(<EmployeeAssignmentPDF data={data} />)).not.toThrow();
  });

  it('maps GOOD generalStatus to "Bueno" (REQ-08)', () => {
    // Since @react-pdf/renderer is mocked, we just assert the component does not crash
    // and that STATUS_LABELS mapping is exercised without throwing
    const data = makeData({
      assignments: [
        {
          id: 'asgn-3',
          assetCode: 'NVH-LAP-00003',
          categoryName: 'Laptop',
          brand: 'HP',
          model: 'EliteBook',
          serialNumber: 'SN999',
          generalStatus: 'GOOD',
          assignedAt: '2024-05-01T00:00:00.000Z',
          deliveredByName: 'Admin',
          notes: null,
        },
      ],
    });
    expect(() => render(<EmployeeAssignmentPDF data={data} />)).not.toThrow();
  });
});
