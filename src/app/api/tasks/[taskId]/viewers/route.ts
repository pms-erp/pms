// app/api/tasks/[taskId]/viewers/route.ts
// GET    — list all viewers for a task
// POST   — add viewer(s) { userIds: string[] }
// DELETE — remove a viewer  ?userId=xxx
//
// Only ADMIN, PROJECT_MANAGER, TEAM_LEADER can manage viewers.
// Any user who is a viewer can read tasks (handled in your task RBAC).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskViewers, users, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";

const CAN_MANAGE = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"];

type Params = { params: Promise<{ taskId: string }> };

// ── GET — fetch all viewers ───────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;

  const viewers = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      avatar: users.avatar,
      role: users.role,
      addedAt: taskViewers.added_at,
    })
    .from(taskViewers)
    .innerJoin(users, eq(taskViewers.user_id, users.id))
    .where(eq(taskViewers.task_id, taskId))
    .orderBy(taskViewers.added_at);

  return NextResponse.json({ viewers });
}

// ── POST — add viewers ────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, id: currentUserId } = session.user;
  if (!CAN_MANAGE.includes(role)) {
    return NextResponse.json(
      {
        error:
          "Only admins, project managers and team leaders can manage viewers",
      },
      { status: 403 },
    );
  }

  const { taskId } = await params;
  const body = (await req.json()) as { userIds?: string[] };

  if (!body.userIds?.length) {
    return NextResponse.json({ error: "userIds required" }, { status: 400 });
  }

  // Verify task exists
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task)
    return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Insert — skip duplicates via onDuplicateKeyUpdate (no-op)
  for (const userId of body.userIds) {
    await db
      .insert(taskViewers)
      .values({
        id: nanoid(),
        task_id: taskId,
        user_id: userId,
        added_by: currentUserId,
      })
      .onDuplicateKeyUpdate({ set: { added_by: currentUserId } })
      .catch(() => {});
  }

  // Return updated viewer list
  const viewers = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      avatar: users.avatar,
      role: users.role,
    })
    .from(taskViewers)
    .innerJoin(users, eq(taskViewers.user_id, users.id))
    .where(eq(taskViewers.task_id, taskId))
    .orderBy(taskViewers.added_at);

  return NextResponse.json({ success: true, viewers });
}

// ── DELETE — remove one viewer ────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = session.user;
  if (!CAN_MANAGE.includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });

  await db
    .delete(taskViewers)
    .where(
      and(eq(taskViewers.task_id, taskId), eq(taskViewers.user_id, userId)),
    );

  return NextResponse.json({ success: true });
}
