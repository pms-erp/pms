// lib/projects/validation.ts

import { z } from "zod";

export const PROJECT_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "IN_QA",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const createProjectSchema = z.object({
  name: z.string().trim().min(3, "Project name must be at least 3 characters"),

  client_name: z.string().trim().optional(),

  website_url: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^https?:\/\/.+\..+/.test(val),
      "Must be a valid URL",
    ),

  fiverr_order_id: z.string().trim().optional(),

  status: z.enum(PROJECT_STATUSES),

  // ── Notes / body (optional free-text) ────────────────────────────────────
  body: z.string().optional(),

  // ── File attachments (JSON-stringified array, set by the client) ──────────
  files: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
