export type TaskStatus =
  | "IN_PROGRESS"
  | "WAITING_FOR_QA"
  | "APPROVED"
  | "REWORK";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export type TeamType = "DEVELOPER" | "DESIGNER" | "PROGRAMMER";

export type TaskStats = {
  total: number;
  inProgress: number;
  waitingForQa: number;
  waitingForQaAssigned?: number;
  approved: number;
  rework: number;
  projectViewerTasks: number; // tasks in projects where user is a viewer
};

export type GetTasksOptions = {
  userId: string;
  role: string;
  status?: TaskStatus;
  teamType?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH"; // ✅ Added priority
  search?: string;
  projectId?: string;
  page?: number;
  limit?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
};
