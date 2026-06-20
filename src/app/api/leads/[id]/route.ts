// src/app/api/leads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { leads, leadFollowups, users, leadActivityLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { canViewLeads, canManageLeads, isMarketingContext } from "@/lib/rbac";
import { v4 as uuidv4 } from "uuid";

// ── Helper: insert an activity log row ────────────────────────────────────────
async function logActivity(params: {
  lead_id: string;
  action:
    | "CREATED"
    | "UPDATED"
    | "STATUS_CHANGED"
    | "FOLLOWUP_ADDED"
    | "FOLLOWUP_DELETED";
  summary: string;
  changes?: Record<string, unknown>;
  performed_by: string;
  performed_by_name: string;
}) {
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.lead_id,
    action: params.action,
    summary: params.summary,
    changes: params.changes ? JSON.stringify(params.changes) : null,
    performed_by: params.performed_by,
    performed_by_name: params.performed_by_name,
  });
}

// ── Readable field labels for the activity log summary ────────────────────────
const FIELD_LABELS: Record<string, string> = {
  platform: "Platform",
  client_name: "Client Name",
  username: "Username",
  email: "Email",
  phone: "Phone",
  country: "Country",
  profile_url: "Profile URL",
  date_received: "Date Received",
  project_title: "Project Title",
  requirements: "Requirements",
  challenges: "Challenges",
  budget: "Budget",
  estimated_cost: "Estimated Cost",
  proposed_quote: "Proposed Quote",
  expected_timeline: "Timeline",
  service_category: "Service Category",
  status: "Status",
  priority: "Priority",
  assigned_to: "Assigned To",
  follow_up_date: "Follow-up Date",
  next_follow_up_date: "Next Follow-up Date",
  notes: "Notes",
  deal_value: "Deal Value",
  closing_date: "Closing Date",
  lost_reason: "Lost Reason",
};

// ── GET /api/leads/[id] ────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [lead] = await db
      .select({
        lead: leads,
        sent_by_name: users.name,
        sent_by_avatar: users.avatar,
      })
      .from(leads)
      .leftJoin(users, eq(leads.sent_by, users.id))
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ownership check:
    // - ADMIN + PM → see all
    // - Marketing team members → see all (team-shared)
    // - Everyone else → only their own
    const isMarketing = isMarketingContext(role, team_type);
    if (
      !canManageLeads(role) &&
      !isMarketing &&
      lead.lead.sent_by !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [followups, activityLogs] = await Promise.all([
      db
        .select({
          followup: leadFollowups,
          created_by_name: users.name,
        })
        .from(leadFollowups)
        .leftJoin(users, eq(leadFollowups.created_by, users.id))
        .where(eq(leadFollowups.lead_id, id))
        .orderBy(desc(leadFollowups.created_at)),

      db
        .select()
        .from(leadActivityLogs)
        .where(eq(leadActivityLogs.lead_id, id))
        .orderBy(desc(leadActivityLogs.created_at)),
    ]);

    return NextResponse.json({
      ...lead.lead,
      sent_by_name: lead.sent_by_name,
      sent_by_avatar: lead.sent_by_avatar,
      platform_data: lead.lead.platform_data
        ? JSON.parse(lead.lead.platform_data)
        : {},
      followups: followups.map((f) => ({
        ...f.followup,
        created_by_name: f.created_by_name,
      })),
      activity_logs: activityLogs,
    });
  } catch (err) {
    console.error("GET /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ── PATCH /api/leads/[id] ──────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Fetch existing lead for ownership check + change diffing
    const [existing] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ownership check:
    // - ADMIN + PM → edit all
    // - Marketing team members → edit all (team-shared)
    // - Everyone else → only their own
    const isMarketing = isMarketingContext(role, team_type);
    if (
      !canManageLeads(role) &&
      !isMarketing &&
      existing.sent_by !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowedFields = [
      "platform",
      "client_name",
      "username",
      "email",
      "phone",
      "country",
      "profile_url",
      "date_received",
      "project_title",
      "requirements",
      "challenges",
      "budget",
      "estimated_cost",
      "proposed_quote",
      "expected_timeline",
      "service_category",
      "status",
      "priority",
      "assigned_to",
      "follow_up_date",
      "next_follow_up_date",
      "notes",
      "deal_value",
      "closing_date",
      "lost_reason",
      "won_project_id",
    ];

    const updateData: Record<string, string | number | boolean | null | Date> =
      {};
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};

    for (const field of allowedFields) {
      if (field in body) {
        const newVal = body[field] === "" ? null : body[field];
        const oldVal = (existing as Record<string, unknown>)[field] ?? null;
        if (String(oldVal ?? "") !== String(newVal ?? "")) {
          changedFields[field] = { from: oldVal, to: newVal };
        }
        updateData[field] = newVal;
      }
    }

    if ("platform_data" in body) {
      updateData.platform_data = body.platform_data
        ? JSON.stringify(body.platform_data)
        : null;
    }

    updateData.updated_at = new Date();

    await db.update(leads).set(updateData).where(eq(leads.id, id));

    // ── Build activity log ──────────────────────────────────────────────────
    if (Object.keys(changedFields).length > 0) {
      // Status change gets its own action type for easy filtering
      const isStatusChange =
        Object.keys(changedFields).length === 1 && "status" in changedFields;

      const action = isStatusChange ? "STATUS_CHANGED" : "UPDATED";

      let summary: string;
      if (isStatusChange) {
        summary = `Status changed from ${changedFields.status.from ?? "—"} to ${changedFields.status.to}`;
      } else {
        const labels = Object.keys(changedFields)
          .map((k) => FIELD_LABELS[k] ?? k)
          .join(", ");
        summary = `Updated: ${labels}`;
      }

      await logActivity({
        lead_id: id,
        action,
        summary,
        changes: changedFields,
        performed_by: session.user.id,
        performed_by_name: session.user.name,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ── DELETE /api/leads/[id] ─────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const role = session.user.role;

  try {
    // Fetch the lead to check ownership
    const [existing] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Permission check:
    // - ADMIN + PROJECT_MANAGER → can delete any lead
    // - Regular users → can only delete leads they created
    const canDelete =
      canManageLeads(role) || // ADMIN or PROJECT_MANAGER
      existing.sent_by === session.user.id; // creator of the lead

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Logs cascade-delete with the lead via FK, so no manual cleanup needed
    await db.delete(leads).where(eq(leads.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/leads/[id] error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
