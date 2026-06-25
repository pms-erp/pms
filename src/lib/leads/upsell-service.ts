// src/lib/leads/upsell-service.ts

import { db } from "@/db";
import {
  leads,
  leadClientFeedback,
  leadActivityLogs,
  LeadPlatform,
  LeadPriority,
  ServiceCategory,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

type Performer = { id: string; name: string };

// ── Get prefill data for "Convert to New Lead" ────────────────────────────────
export async function getUpsellPrefillData(lead_id: string) {
  const [lead] = await db
    .select({
      platform: leads.platform,
      client_name: leads.client_name,
      email: leads.email,
      phone: leads.phone,
      country: leads.country,
      profile_url: leads.profile_url,
    })
    .from(leads)
    .where(eq(leads.id, lead_id))
    .limit(1);

  return lead ?? null;
}

// ── Log an upsell opportunity ─────────────────────────────────────────────────
export async function logUpsellOpportunity(params: {
  leadId: string;
  performedBy: Performer;
  notes: string;
  serviceCategory: string | null;
  estimatedValue: number | null;
}) {
  // Log the activity
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.leadId,
    action: "UPSELL_IDENTIFIED",
    summary: `Upsell opportunity identified${params.serviceCategory ? ` — ${params.serviceCategory.replace(/_/g, " ")}` : ""}${params.estimatedValue ? ` ($${params.estimatedValue.toLocaleString()})` : ""}`,
    changes: JSON.stringify({
      notes: { from: null, to: params.notes },
      service_category: { from: null, to: params.serviceCategory },
      estimated_value: { from: null, to: params.estimatedValue },
    }),
    performed_by: params.performedBy.id,
    performed_by_name: params.performedBy.name,
  });

  return { success: true };
}

// ── Convert upsell to a new lead ──────────────────────────────────────────────
export async function convertUpsellToLead(params: {
  originalLeadId: string;
  performedBy: Performer;
  newLead: {
    platform: string;
    client_name: string;
    username: string | null;
    email: string | null;
    phone: string | null;
    country: string | null;
    profile_url: string | null;
    date_received: string;
    project_title: string | null;
    requirements: string | null;
    challenges: string | null;
    service_category: string | null;
    budget: number | null;
    estimated_cost: number | null;
    proposed_quote: number | null;
    expected_timeline: string | null;
    priority: string;
    notes: string | null;
  };
}) {
  const newLeadId = uuidv4();

  // Get original lead's sent_by for the new lead
  const [original] = await db
    .select({ sent_by: leads.sent_by })
    .from(leads)
    .where(eq(leads.id, params.originalLeadId))
    .limit(1);

  if (!original) return { success: false, error: "Original lead not found" };

  await db.insert(leads).values({
    id: newLeadId,
    platform: params.newLead.platform as (typeof LeadPlatform)[number],
    client_name: params.newLead.client_name,
    username: params.newLead.username,
    email: params.newLead.email,
    phone: params.newLead.phone,
    country: params.newLead.country,
    profile_url: params.newLead.profile_url,
    date_received: new Date(params.newLead.date_received),
    project_title: params.newLead.project_title,
    requirements: params.newLead.requirements,
    challenges: params.newLead.challenges,
    service_category: params.newLead.service_category as
      | (typeof ServiceCategory)[number]
      | null,
    budget:
      params.newLead.budget != null ? String(params.newLead.budget) : null,
    estimated_cost:
      params.newLead.estimated_cost != null
        ? String(params.newLead.estimated_cost)
        : null,
    proposed_quote:
      params.newLead.proposed_quote != null
        ? String(params.newLead.proposed_quote)
        : null,
    expected_timeline: params.newLead.expected_timeline,
    priority:
      (params.newLead.priority as (typeof LeadPriority)[number]) ?? "MEDIUM",
    status: "NEW",
    sent_by: original.sent_by,
    notes: params.newLead.notes,
  });

  // Log UPSELL_CONVERTED on the original lead
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.originalLeadId,
    action: "UPSELL_CONVERTED",
    summary: `Upsell converted to new lead — ${params.newLead.client_name}${params.newLead.project_title ? ` (${params.newLead.project_title})` : ""}`,
    changes: JSON.stringify({
      upsell_lead_id: { from: null, to: newLeadId },
    }),
    performed_by: params.performedBy.id,
    performed_by_name: params.performedBy.name,
  });

  // Log CREATED on the new lead
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: newLeadId,
    action: "CREATED",
    summary: `Lead created from upsell of lead ${params.originalLeadId}`,
    changes: null,
    performed_by: params.performedBy.id,
    performed_by_name: params.performedBy.name,
  });

  return { success: true, newLeadId };
}
