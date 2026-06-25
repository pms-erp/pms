// src/app/api/leads/[id]/link-project/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageLeads } from "@/lib/rbac";
import {
  linkLeadToProject,
  unlinkLeadFromProject,
  getLinkedProjectsForLead,
} from "@/lib/leads/lead-project-service";

// GET — list linked projects
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const linked = await getLinkedProjectsForLead(id);
    return NextResponse.json({ linked });
  } catch (err) {
    console.error("GET /api/leads/[id]/link-project error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// POST — link project to lead
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canManageLeads(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: lead_id } = await params;

  try {
    const { project_id, notes } = await req.json();
    if (!project_id)
      return NextResponse.json(
        { error: "project_id required" },
        { status: 400 },
      );

    const result = await linkLeadToProject({
      lead_id,
      project_id,
      linked_by: session.user.id,
      linked_by_name: session.user.name,
      notes,
    });

    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/leads/[id]/link-project error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// DELETE — unlink project from lead (?project_id=xxx)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canManageLeads(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: lead_id } = await params;
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get("project_id");

  if (!project_id)
    return NextResponse.json({ error: "project_id required" }, { status: 400 });

  try {
    await unlinkLeadFromProject({
      lead_id,
      project_id,
      unlinked_by: session.user.id,
      unlinked_by_name: session.user.name,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/leads/[id]/link-project error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
