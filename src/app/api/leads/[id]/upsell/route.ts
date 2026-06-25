// src/app/api/leads/[id]/upsell/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canViewLeads, canManageLeads } from "@/lib/rbac";
import {
  getUpsellPrefillData,
  logUpsellOpportunity,
} from "@/lib/leads/upsell-service";

// GET — prefill data for Convert to New Lead
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
    const prefill = await getUpsellPrefillData(id);
    if (!prefill)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ prefill });
  } catch (err) {
    console.error("GET /api/leads/[id]/upsell error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// POST — log upsell opportunity
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
      .select({ sent_by: leads.sent_by })
      .from(leads)
      .where(eq(leads.id, id))
      .limit(1);

    if (!lead)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const canLog = canManageLeads(role) || lead.sent_by === session.user.id;
    if (!canLog)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { notes, service_category, estimated_value } = body;

    if (!notes || typeof notes !== "string" || !notes.trim())
      return NextResponse.json(
        { error: "Upsell notes are required" },
        { status: 400 },
      );

    const result = await logUpsellOpportunity({
      leadId: id,
      performedBy: { id: session.user.id, name: session.user.name },
      notes: notes.trim(),
      serviceCategory: service_category || null,
      estimatedValue:
        estimated_value != null && estimated_value !== ""
          ? Number(estimated_value)
          : null,
    });

    if (!result.success)
      return NextResponse.json(
        { error: "Failed to log upsell" },
        { status: 400 },
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/leads/[id]/upsell error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
