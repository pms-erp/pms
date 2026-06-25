// src/lib/leads/lead-project-service.ts
//
// Shared service for Lead ↔ Project lifecycle integration.
// Project/task routes call logLeadActivityForProject() — they never touch
// the leads table directly.

import { db } from "@/db";
import {
  leads,
  leadProjects,
  leadActivityLogs,
  leadClientFeedback,
  projects,
  users,
  type LeadActivityActionType,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LinkedProject = {
  id: string; // leadProjects.id
  project_id: string;
  project_name: string;
  project_status: string;
  linked_by_name: string | null;
  notes: string | null;
  created_at: Date;
};

// ── logLeadActivityForProject ─────────────────────────────────────────────────
// Called from project PATCH route when status changes to COMPLETED.
// Looks up all leads linked to the project, writes an activity log for each.
// No-op if no lead is linked.

export async function logLeadActivityForProject(params: {
  project_id: string;
  action: LeadActivityActionType;
  summary: string;
  performed_by: string;
  performed_by_name: string;
}): Promise<void> {
  const links = await db
    .select({ lead_id: leadProjects.lead_id })
    .from(leadProjects)
    .where(eq(leadProjects.project_id, params.project_id));

  if (links.length === 0) return;

  await Promise.all(
    links.map((link) =>
      db.insert(leadActivityLogs).values({
        id: uuidv4(),
        lead_id: link.lead_id,
        action: params.action,
        summary: params.summary,
        changes: null,
        performed_by: params.performed_by,
        performed_by_name: params.performed_by_name,
      }),
    ),
  );
}

// ── createFeedbackAttemptsForProject ──────────────────────────────────────────
// Called when a project is marked COMPLETED.
// Creates 3 PENDING feedback attempt records for each linked lead.

export async function createFeedbackAttemptsForProject(params: {
  project_id: string;
  performed_by: string;
  performed_by_name: string;
}): Promise<void> {
  // Get all leads linked to this project
  const links = await db
    .select({ lead_id: leadProjects.lead_id })
    .from(leadProjects)
    .where(eq(leadProjects.project_id, params.project_id));

  if (links.length === 0) return;

  // For each lead, create 3 feedback attempts
  await Promise.all(
    links.map(async (link) => {
      // Check if feedback records already exist for this lead+project
      const existing = await db
        .select({ id: leadClientFeedback.id })
        .from(leadClientFeedback)
        .where(
          and(
            eq(leadClientFeedback.lead_id, link.lead_id),
            eq(leadClientFeedback.project_id, params.project_id),
          ),
        )
        .limit(1);

      // Skip if records already exist
      if (existing.length > 0) return;

      // Create 3 PENDING feedback attempts
      await db.insert(leadClientFeedback).values([
        {
          id: uuidv4(),
          lead_id: link.lead_id,
          project_id: params.project_id,
          feedback_attempt: 1,
          status: "PENDING",
          upsell_discussed: false,
        },
        {
          id: uuidv4(),
          lead_id: link.lead_id,
          project_id: params.project_id,
          feedback_attempt: 2,
          status: "PENDING",
          upsell_discussed: false,
        },
        {
          id: uuidv4(),
          lead_id: link.lead_id,
          project_id: params.project_id,
          feedback_attempt: 3,
          status: "PENDING",
          upsell_discussed: false,
        },
      ]);

      // Log activity
      await db.insert(leadActivityLogs).values({
        id: uuidv4(),
        lead_id: link.lead_id,
        action: "PROJECT_COMPLETED",
        summary: "Project completed — 3 feedback attempts created",
        changes: null,
        performed_by: params.performed_by,
        performed_by_name: params.performed_by_name,
      });
    }),
  );
}

// ── getLinkedProjectsForLead ──────────────────────────────────────────────────

export async function getLinkedProjectsForLead(
  lead_id: string,
): Promise<LinkedProject[]> {
  const rows = await db
    .select({
      id: leadProjects.id,
      project_id: leadProjects.project_id,
      project_name: projects.name,
      project_status: projects.status,
      linked_by_name: users.name,
      notes: leadProjects.notes,
      created_at: leadProjects.created_at,
    })
    .from(leadProjects)
    .leftJoin(projects, eq(leadProjects.project_id, projects.id))
    .leftJoin(users, eq(leadProjects.linked_by, users.id))
    .where(eq(leadProjects.lead_id, lead_id))
    .orderBy(leadProjects.created_at);

  return rows.map((r) => ({
    id: r.id,
    project_id: r.project_id,
    project_name: r.project_name ?? "Unknown Project",
    project_status: r.project_status ?? "UNKNOWN",
    linked_by_name: r.linked_by_name,
    notes: r.notes,
    created_at: r.created_at,
  }));
}

// ── linkLeadToProject ─────────────────────────────────────────────────────────

export async function linkLeadToProject(params: {
  lead_id: string;
  project_id: string;
  linked_by: string;
  linked_by_name: string;
  notes?: string;
}): Promise<{ id: string }> {
  // Check not already linked
  const existing = await db
    .select({ id: leadProjects.id })
    .from(leadProjects)
    .where(
      and(
        eq(leadProjects.lead_id, params.lead_id),
        eq(leadProjects.project_id, params.project_id),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id };
  }

  const id = uuidv4();
  await db.insert(leadProjects).values({
    id,
    lead_id: params.lead_id,
    project_id: params.project_id,
    linked_by: params.linked_by,
    notes: params.notes ?? null,
  });

  // Sync won_project_id on leads table (first link wins as primary)
  const [lead] = await db
    .select({ won_project_id: leads.won_project_id })
    .from(leads)
    .where(eq(leads.id, params.lead_id))
    .limit(1);

  if (lead && !lead.won_project_id) {
    await db
      .update(leads)
      .set({ won_project_id: params.project_id, updated_at: new Date() })
      .where(eq(leads.id, params.lead_id));
  }

  // Log activity
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.lead_id,
    action: "PROJECT_LINKED",
    summary: `Project linked by ${params.linked_by_name}`,
    changes: JSON.stringify({ project_id: params.project_id }),
    performed_by: params.linked_by,
    performed_by_name: params.linked_by_name,
  });

  return { id };
}

// ── unlinkLeadFromProject ─────────────────────────────────────────────────────

export async function unlinkLeadFromProject(params: {
  lead_id: string;
  project_id: string;
  unlinked_by: string;
  unlinked_by_name: string;
}): Promise<void> {
  await db
    .delete(leadProjects)
    .where(
      and(
        eq(leadProjects.lead_id, params.lead_id),
        eq(leadProjects.project_id, params.project_id),
      ),
    );

  // Clear won_project_id if it pointed to this project
  const [lead] = await db
    .select({ won_project_id: leads.won_project_id })
    .from(leads)
    .where(eq(leads.id, params.lead_id))
    .limit(1);

  if (lead?.won_project_id === params.project_id) {
    // Check if another link exists to promote
    const remaining = await db
      .select({ project_id: leadProjects.project_id })
      .from(leadProjects)
      .where(eq(leadProjects.lead_id, params.lead_id))
      .limit(1);

    await db
      .update(leads)
      .set({
        won_project_id: remaining[0]?.project_id ?? null,
        updated_at: new Date(),
      })
      .where(eq(leads.id, params.lead_id));
  }

  // Log activity
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.lead_id,
    action: "PROJECT_UNLINKED",
    summary: `Project unlinked by ${params.unlinked_by_name}`,
    changes: JSON.stringify({ project_id: params.project_id }),
    performed_by: params.unlinked_by,
    performed_by_name: params.unlinked_by_name,
  });
}

// ── searchProjectsForLinking ──────────────────────────────────────────────────
// Used by the picker in lead-detail-sheet to search projects.

export async function searchProjectsForLinking(query: string) {
  const { sql, like, or } = await import("drizzle-orm");
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      client_name: projects.client_name,
      status: projects.status,
    })
    .from(projects)
    .where(
      or(
        like(projects.name, `%${query}%`),
        like(projects.client_name, `%${query}%`),
      ),
    )
    .limit(20);

  return rows;
}
