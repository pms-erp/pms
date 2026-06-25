// src/lib/leads/feedback-service.ts

import { db } from "@/db";
import {
  leadClientFeedback,
  leadActivityLogs,
  leadProjects,
  projects,
  users,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

type Performer = { id: string; name: string };

// ── Get post-delivery state for a lead ───────────────────────────────────────
export async function getPostDeliveryState(lead_id: string) {
  // Get all feedback rows for this lead, joined with project info
  const rows = await db
    .select({
      feedback: leadClientFeedback,
      project_name: projects.name,
      project_status: projects.status,
      collected_by_name: users.name,
    })
    .from(leadClientFeedback)
    .leftJoin(projects, eq(leadClientFeedback.project_id, projects.id))
    .leftJoin(users, eq(leadClientFeedback.collected_by, users.id))
    .where(eq(leadClientFeedback.lead_id, lead_id));

  if (rows.length === 0) return [];

  // Group by project
  const byProject = new Map<string, typeof rows>();
  for (const row of rows) {
    const pid = row.feedback.project_id;
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid)!.push(row);
  }

  const result = [];
  for (const [project_id, projectRows] of byProject) {
    const attempts = projectRows
      .map((r) => ({
        id: r.feedback.id,
        feedback_attempt: r.feedback.feedback_attempt,
        feedback_date: r.feedback.feedback_date,
        collected_by: r.feedback.collected_by,
        collected_by_name: r.collected_by_name,
        rating: r.feedback.rating,
        feedback_text: r.feedback.feedback_text,
        status: r.feedback.status,
        upsell_discussed: r.feedback.upsell_discussed,
        upsell_notes: r.feedback.upsell_notes,
        upsell_service_category: r.feedback.upsell_service_category,
        upsell_estimated_value: r.feedback.upsell_estimated_value,
        upsell_lead_id: r.feedback.upsell_lead_id,
        created_at: r.feedback.created_at,
      }))
      .sort((a, b) => a.feedback_attempt - b.feedback_attempt);

    const received = attempts.some((a) => a.status === "RECEIVED");
    const exhausted =
      attempts.every((a) => a.status !== "PENDING") &&
      attempts.length === 3 &&
      !received;
    const pending = attempts.find((a) => a.status === "PENDING") ?? null;

    result.push({
      project_id,
      project_name: projectRows[0].project_name ?? "Unknown",
      project_status: projectRows[0].project_status ?? "PLANNING",
      attempts,
      currentAttempt: pending ? pending.feedback_attempt : null,
      exhausted,
      received,
    });
  }

  return result;
}

// ── Log a feedback attempt ────────────────────────────────────────────────────
export async function logFeedbackAttempt(params: {
  feedbackId: string;
  leadId: string;
  performedBy: Performer;
  feedbackDate: string;
  responded: boolean;
  rating: number | null;
  feedbackText: string | null;
}) {
  const [existing] = await db
    .select()
    .from(leadClientFeedback)
    .where(eq(leadClientFeedback.id, params.feedbackId))
    .limit(1);

  if (!existing) return { success: false, error: "Feedback record not found" };
  if (existing.status !== "PENDING")
    return { success: false, error: "This attempt has already been logged" };

  const status = params.responded ? "RECEIVED" : "NO_RESPONSE";

  await db
    .update(leadClientFeedback)
    .set({
      status,
      feedback_date: new Date(params.feedbackDate), // ✅ Convert string to Date
      collected_by: params.performedBy.id,
      rating: params.responded ? params.rating : null,
      feedback_text: params.responded ? params.feedbackText : null,
      updated_at: new Date(),
    })
    .where(eq(leadClientFeedback.id, params.feedbackId));

  const actionMap: Record<
    number,
    "FEEDBACK_ATTEMPT_1" | "FEEDBACK_ATTEMPT_2" | "FEEDBACK_ATTEMPT_3"
  > = {
    1: "FEEDBACK_ATTEMPT_1",
    2: "FEEDBACK_ATTEMPT_2",
    3: "FEEDBACK_ATTEMPT_3",
  };

  const attemptAction =
    actionMap[existing.feedback_attempt] ?? "FEEDBACK_ATTEMPT_1";

  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.leadId,
    action: params.responded ? "FEEDBACK_RECEIVED" : attemptAction,
    summary: params.responded
      ? `Client feedback received (attempt ${existing.feedback_attempt}) — rating: ${params.rating ?? "—"}/5`
      : `Attempt ${existing.feedback_attempt} logged — no response from client`,
    changes: null,
    performed_by: params.performedBy.id,
    performed_by_name: params.performedBy.name,
  });

  return { success: true };
}

// ── Edit an already-logged feedback attempt (most recent only) ────────────────
export async function editFeedbackAttempt(params: {
  feedbackId: string;
  leadId: string;
  performedBy: Performer;
  feedbackDate: string;
  responded: boolean;
  rating: number | null;
  feedbackText: string | null;
}) {
  const [existing] = await db
    .select()
    .from(leadClientFeedback)
    .where(eq(leadClientFeedback.id, params.feedbackId))
    .limit(1);

  if (!existing) return { success: false, error: "Feedback record not found" };
  if (existing.status === "PENDING")
    return {
      success: false,
      error: "Cannot edit a pending attempt — log it first",
    };

  const status = params.responded ? "RECEIVED" : "NO_RESPONSE";

  await db
    .update(leadClientFeedback)
    .set({
      status,
      feedback_date: new Date(params.feedbackDate), // ✅ Convert string to Date
      collected_by: params.performedBy.id,
      rating: params.responded ? params.rating : null,
      feedback_text: params.responded ? params.feedbackText : null,
      updated_at: new Date(),
    })
    .where(eq(leadClientFeedback.id, params.feedbackId));

  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.leadId,
    action: params.responded ? "FEEDBACK_RECEIVED" : "FEEDBACK_NONE",
    summary: `Feedback attempt ${existing.feedback_attempt} edited — ${params.responded ? `rating ${params.rating}/5` : "no response"}`,
    changes: null,
    performed_by: params.performedBy.id,
    performed_by_name: params.performedBy.name,
  });

  return { success: true };
}

// ── Delete a feedback attempt (reverts to PENDING) ────────────────────────────
export async function deleteFeedbackAttempt(params: {
  feedbackId: string;
  leadId: string;
}) {
  const [existing] = await db
    .select()
    .from(leadClientFeedback)
    .where(eq(leadClientFeedback.id, params.feedbackId))
    .limit(1);

  if (!existing) return { success: false, error: "Feedback record not found" };

  await db
    .update(leadClientFeedback)
    .set({
      status: "PENDING",
      feedback_date: null,
      collected_by: null,
      rating: null,
      feedback_text: null,
      updated_at: new Date(),
    })
    .where(eq(leadClientFeedback.id, params.feedbackId));

  return { success: true };
}
