// src/app/api/client/messages/route.ts
// GET  — fetch paginated messages for a project
// POST — send a new message with optional file attachment

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projectMessages, clientProjects, users } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { pusherServer } from "@/lib/pusher";
import { getProjectById } from "@/lib/projects/service";

// ── Access check ──────────────────────────────────────────────────────────────
// Reuses the exact same RBAC logic from getProjectById (projects/service.ts).
// If the user can see the project in their dashboard → they can use its chat.
// CLIENT role is handled separately via client_projects table.
async function canAccessChat(
  userId: string,
  role: string,
  teamType: string | null,
  projectId: string,
): Promise<boolean> {
  // ADMIN / PROJECT_MANAGER — full access
  if (role === "ADMIN" || role === "PROJECT_MANAGER") return true;

  // CLIENT — must be linked via client_projects
  if (role === "CLIENT") {
    const link = await db
      .select({ id: clientProjects.id })
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.client_id, userId),
          eq(clientProjects.project_id, projectId),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);
    return !!link;
  }

  // All other staff roles — delegate to getProjectById which already has
  // the correct RBAC for TEAM_LEADER, QA, DEVELOPER, DESIGNER, PROGRAMMER.
  // If it returns null the user cannot see the project → no chat access.
  const project = await getProjectById(projectId, userId, role, teamType);
  return project !== null;
}

// ── GET /api/client/messages?projectId=xxx&cursor=xxx&limit=50 ────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const cursor = searchParams.get("cursor");
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

  if (!projectId)
    return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const allowed = await canAccessChat(
    session.user.id,
    session.user.role,
    session.user.team_type ?? null,
    projectId,
  );
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const whereCondition = cursor
    ? and(
        eq(projectMessages.project_id, projectId),
        sql`${projectMessages.created_at} < ${cursor}`,
      )
    : eq(projectMessages.project_id, projectId);

  const messages = await db
    .select({
      id: projectMessages.id,
      project_id: projectMessages.project_id,
      message: projectMessages.message,
      attachment: projectMessages.attachment,
      created_at: projectMessages.created_at,
      edited_at: projectMessages.edited_at,
      is_deleted: projectMessages.is_deleted,
      senderId: users.id,
      senderName: users.name,
      senderAvatar: users.avatar,
      senderRole: users.role,
    })
    .from(projectMessages)
    .innerJoin(users, eq(projectMessages.sender_id, users.id))
    .where(whereCondition)
    .orderBy(desc(projectMessages.created_at))
    .limit(limit);

  return NextResponse.json({ messages: messages.reverse() });
}

// ── POST /api/client/messages ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    projectId?: string;
    message?: string;
    attachment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, message, attachment } = body;

  if (!projectId || (!message?.trim() && !attachment))
    return NextResponse.json(
      { error: "projectId and message or attachment are required" },
      { status: 400 },
    );

  const allowed = await canAccessChat(
    session.user.id,
    session.user.role,
    session.user.team_type ?? null,
    projectId,
  );
  if (!allowed)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = uuid();
  const now = new Date();

  await db.insert(projectMessages).values({
    id,
    project_id: projectId,
    sender_id: session.user.id,
    message: message?.trim() ?? "",
    attachment: attachment ?? null,
    created_at: now,
  });

  const newMessage = {
    id,
    project_id: projectId,
    message: message?.trim() ?? "",
    attachment: attachment ?? null,
    created_at: now.toISOString(),
    edited_at: null,
    is_deleted: false,
    senderId: session.user.id,
    senderName: session.user.name ?? "Unknown",
    senderAvatar: session.user.image ?? null,
    senderRole: session.user.role,
  };

  await pusherServer.trigger(
    `project-chat-${projectId}`,
    "new_message",
    newMessage,
  );

  return NextResponse.json({ success: true, message: newMessage });
}
