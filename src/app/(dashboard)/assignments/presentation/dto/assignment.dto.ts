export type AssignmentStatus = 'ACTIVE' | 'RETURNED' | 'TRANSFERRED';

export interface EmployeeAssignmentRow {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeDepartment: string | null;
  employeeLocation: string | null;
  activeCount: number;
  lastAssignedAt: string | null;
  lastReturnedAt: string | null;
}

export interface AssignmentRow {
  id: string;
  assetId: string;
  assetCode: string;
  assetLabel: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  status: AssignmentStatus;
  assignedAt: string;
  returnedAt: string | null;
  deliveredById: string | null;
  deliveredByName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateAssignmentDTO {
  assetId: string;
  employeeId: string;
  notes?: string | null;
}

export interface ReturnAssignmentDTO {
  notes?: string | null;
}

export interface TransferAssignmentDTO {
  newEmployeeId: string;
  notes?: string | null;
}
