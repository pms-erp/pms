// lib/projects/types.ts

export type ProjectStatus =
  | "PLANNING"
  | "ACTIVE"
  | "IN_QA"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type GetProjectsOptions = {
  userId: string;
  role: string;
  status?: ProjectStatus;
  search?: string;
  page?: number;
  limit?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};
