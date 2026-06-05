export interface DepartmentRow {
  id: string;
  name: string;
  employeesCount: number;
  createdAt: string;
}

export interface CreateDepartmentDTO {
  name: string;
}

export type UpdateDepartmentDTO = Partial<CreateDepartmentDTO>;
