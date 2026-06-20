// src/app/api/client/projects/manage/route.ts
// Admin/PM only — link or unlink a CLIENT user to a project

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { clientProjects, users, projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// ── GET /api/client/projects/manage?projectId=xxx
// Returns all clients linked to a project (for admin UI)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId)
    return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const linkedClients = await db
    .select({
      linkId: clientProjects.id,
      clientId: users.id,
      clientName: users.name,
      clientUsername: users.username,
      clientEmail: users.email,
      clientAvatar: users.avatar,
      linkedAt: clientProjects.created_at,
    })
    .from(clientProjects)
    .innerJoin(users, eq(clientProjects.client_id, users.id))
    .where(eq(clientProjects.project_id, projectId));

  return NextResponse.json({ clients: linkedClients });
}

// ── POST /api/client/projects/manage
// Body: { clientId, projectId }  → link client to project
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { clientId?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clientId, projectId } = body;
  if (!clientId || !projectId)
    return NextResponse.json(
      { error: "clientId and projectId are required" },
      { status: 400 },
    );

  // Verify user is actually a CLIENT
  const client = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, clientId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!client || client.role !== "CLIENT")
    return NextResponse.json(
      { error: "User is not a CLIENT" },
      { status: 400 },
    );

  // Verify project exists
  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Check if already linked
  const existing = await db
    .select({ id: clientProjects.id })
    .from(clientProjects)
    .where(
      and(
        eq(clientProjects.client_id, clientId),
        eq(clientProjects.project_id, projectId),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (existing)
    return NextResponse.json(
      { error: "Client already linked to this project" },
      { status: 400 },
    );

  const id = uuid();
  await db.insert(clientProjects).values({
    id,
    client_id: clientId,
    project_id: projectId,
    invited_by: session.user.id,
  });

  return NextResponse.json({ success: true, id });
}

// ── DELETE /api/client/projects/manage
// Body: { clientId, projectId }  → unlink client from project
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { clientId?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { clientId, projectId } = body;
  if (!clientId || !projectId)
    return NextResponse.json(
      { error: "clientId and projectId are required" },
      { status: 400 },
    );

  await db
    .delete(clientProjects)
    .where(
      and(
        eq(clientProjects.client_id, clientId),
        eq(clientProjects.project_id, projectId),
      ),
    );

  return NextResponse.json({ success: true });
}
