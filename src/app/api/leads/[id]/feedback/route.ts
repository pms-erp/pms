// src/app/api/leads/[id]/feedback/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canViewLeads, canManageLeads } from "@/lib/rbac";
import {
  getPostDeliveryState,
  logFeedbackAttempt,
} from "@/lib/leads/feedback-service";

// GET — post-delivery state for a lead
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [lead] = await db
      .select({ id: leads.id, sent_by: leads.sent_by })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const postDelivery = await getPostDeliveryState(id);
    return NextResponse.json({ postDelivery });
  } catch (err) {
    console.error("GET /api/leads/[id]/feedback error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// POST — log a pending feedback attempt
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [lead] = await db
      .select({ id: leads.id, sent_by: leads.sent_by })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Only ADMIN/PM or the lead's owner can log feedback
    const canLog = canManageLeads(role) || lead.sent_by === session.user.id;
    if (!canLog)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { feedback_id, feedback_date, responded, rating, feedback_text } =
      body;

    if (!feedback_id || typeof feedback_id !== "string")
      return NextResponse.json(
        { error: "feedback_id is required" },
        { status: 400 },
      );
    if (!feedback_date || typeof feedback_date !== "string")
      return NextResponse.json(
        { error: "feedback_date is required" },
        { status: 400 },
      );
    if (typeof responded !== "boolean")
      return NextResponse.json(
        { error: "responded (boolean) is required" },
        { status: 400 },
      );

    const result = await logFeedbackAttempt({
      feedbackId: feedback_id,
      leadId: id,
      performedBy: { id: session.user.id, name: session.user.name },
      feedbackDate: feedback_date, // ✅ Already a string "YYYY-MM-DD"
      responded,
      rating: rating != null ? Number(rating) : null,
      feedbackText: feedback_text || null,
    });

    if (!result.success)
      return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/leads/[id]/feedback error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
