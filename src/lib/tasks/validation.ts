// src/lib/tasks/validation.ts
import { z } from "zod";

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const TASK_STATUSES = [
  "IN_PROGRESS",
  "WAITING_FOR_QA",
  "APPROVED",
  "REWORK",
] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const createTaskSchema = z.object({
  project_id: z.string().min(1, "Project is required"),
  team_type: z.string().min(1, "Team type is required"), // ← was z.enum(TEAM_TYPES)
  title: z.string().trim().min(3, "Title must be at least 3 characters"),
  description: z.string().trim().optional(),
  priority: z.enum(TASK_PRIORITIES),
  assigned_to: z.string().min(1, "Assignee is required"),
  estimated_minutes: z
    .number()
    .min(1, "Estimated time must be at least 1 minute")
    .optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  qa_assigned_to: z.string().nullable().optional(),
  qa_assigned_at: z.string().nullable().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
