// src/app/api/leads/[id]/upsell/convert/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canViewLeads, canManageLeads } from "@/lib/rbac";
import { convertUpsellToLead } from "@/lib/leads/upsell-service";

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

    if (!body.client_name || typeof body.client_name !== "string")
      return NextResponse.json(
        { error: "Client name is required" },
        { status: 400 },
      );
    if (!body.date_received || typeof body.date_received !== "string")
      return NextResponse.json(
        { error: "Date received is required" },
        { status: 400 },
      );
    if (!body.platform || typeof body.platform !== "string")
      return NextResponse.json(
        { error: "Platform is required" },
        { status: 400 },
      );

    const result = await convertUpsellToLead({
      originalLeadId: id,
      performedBy: { id: session.user.id, name: session.user.name },
      newLead: {
        platform: body.platform,
        client_name: body.client_name,
        username: body.username || null,
        email: body.email || null,
        phone: body.phone || null,
        country: body.country || null,
        profile_url: body.profile_url || null,
        date_received: body.date_received,
        project_title: body.project_title || null,
        requirements: body.requirements || null,
        challenges: body.challenges || null,
        service_category: body.service_category || null,
        budget:
          body.budget != null && body.budget !== ""
            ? Number(body.budget)
            : null,
        estimated_cost:
          body.estimated_cost != null && body.estimated_cost !== ""
            ? Number(body.estimated_cost)
            : null,
        proposed_quote:
          body.proposed_quote != null && body.proposed_quote !== ""
            ? Number(body.proposed_quote)
            : null,
        expected_timeline: body.expected_timeline || null,
        priority: body.priority || "MEDIUM",
        notes: body.notes || null,
      },
    });

    if (!result.success)
      return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json(
      { success: true, newLeadId: result.newLeadId },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/leads/[id]/upsell/convert error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
