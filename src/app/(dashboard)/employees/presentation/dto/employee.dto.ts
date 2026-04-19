export interface EmployeeRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  position: string | null;
  departmentId: string | null;
  departmentName: string | null;
  cityId: string | null;
  cityName: string | null;
  locationId: string | null;
  locationName: string | null;
  isActive: boolean;
  assignmentsCount: number;
  createdAt: string;
}

export interface CreateEmployeeDTO {
  fullName: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  cityId?: string | null;
  locationId?: string | null;
  isActive?: boolean;
}

export type UpdateEmployeeDTO = Partial<CreateEmployeeDTO>;

export interface EmployeeImportRow {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  city: string | null;
  location: string | null;
  isActive: string | boolean | null;
}
