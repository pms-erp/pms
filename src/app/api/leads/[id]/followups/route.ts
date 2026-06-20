// src/app/api/leads/[id]/followups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { leads, leadFollowups, leadActivityLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { canViewLeads, canManageLeads, isMarketingContext } from "@/lib/rbac";

// ── Helper ────────────────────────────────────────────────────────────────────
async function logActivity(params: {
  lead_id: string;
  action: "FOLLOWUP_ADDED" | "FOLLOWUP_DELETED";
  summary: string;
  performed_by: string;
  performed_by_name: string;
}) {
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.lead_id,
    action: params.action,
    summary: params.summary,
    changes: null,
    performed_by: params.performed_by,
    performed_by_name: params.performed_by_name,
  });
}

// ── POST /api/leads/[id]/followups ─────────────────────────────────────────
export async function POST(
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
    const {
      followup_date,
      followup_type,
      discussion_summary,
      next_action,
      next_followup_date,
    } = body;

    if (!followup_date || !followup_type || !discussion_summary) {
      return NextResponse.json(
        {
          error:
            "followup_date, followup_type, and discussion_summary are required",
        },
        { status: 400 },
      );
    }

    const followupId = uuidv4();

    await db.insert(leadFollowups).values({
      id: followupId,
      lead_id: id,
      followup_date,
      followup_type,
      discussion_summary,
      next_action: next_action || null,
      next_followup_date: next_followup_date || null,
      created_by: session.user.id,
    });

    // Update next_follow_up_date on the lead if provided
    if (next_followup_date) {
      await db
        .update(leads)
        .set({
          next_follow_up_date: next_followup_date,
          updated_at: new Date(),
        })
        .where(eq(leads.id, id));
    }

    // Log the followup addition
    await logActivity({
      lead_id: id,
      action: "FOLLOWUP_ADDED",
      summary: `Follow-up added via ${followup_type} on ${followup_date}`,
      performed_by: session.user.id,
      performed_by_name: session.user.name,
    });

    return NextResponse.json({ id: followupId }, { status: 201 });
  } catch (err) {
    console.error("POST /api/leads/[id]/followups error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ── DELETE /api/leads/[id]/followups?followup_id=xxx ───────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: leadId } = await params;
  const role = session.user.role;
  const team_type = session.user.team_type ?? null;
  const isMarketing = isMarketingContext(role, team_type);

  const { searchParams } = new URL(req.url);
  const followupId = searchParams.get("followup_id");
  if (!followupId) {
    return NextResponse.json(
      { error: "followup_id required" },
      { status: 400 },
    );
  }

  try {
    const [row] = await db
      .select({ created_by: leadFollowups.created_by })
      .from(leadFollowups)
      .where(eq(leadFollowups.id, followupId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ADMIN + PM can delete anyone's followup.
    // Marketing team members can delete any followup in their shared team leads.
    // Everyone else can only delete their own.
    if (
      !canManageLeads(role) &&
      !isMarketing &&
      row.created_by !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(leadFollowups).where(eq(leadFollowups.id, followupId));

    // Log the followup deletion
    await logActivity({
      lead_id: leadId,
      action: "FOLLOWUP_DELETED",
      summary: `Follow-up deleted by ${session.user.name}`,
      performed_by: session.user.id,
      performed_by_name: session.user.name,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/leads/[id]/followups error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
