// src/app/api/client/project-notes/route.ts
// GET — all task notes for a project (admin/PM use in ClientManageDialog)

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes, tasks, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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

  // Get all task IDs for this project first
  const projectTasks = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(eq(tasks.project_id, projectId));

  if (projectTasks.length === 0) return NextResponse.json({ notes: [] });

  const taskIds = projectTasks.map((t) => t.id);
  const taskTitleMap = Object.fromEntries(
    projectTasks.map((t) => [t.id, t.title]),
  );

  const notes = await db
    .select({
      id: taskNotes.id,
      task_id: taskNotes.task_id,
      note: taskNotes.note,
      note_type: taskNotes.note_type,
      is_client_visible: taskNotes.is_client_visible,
      created_at: taskNotes.created_at,
      commenterName: users.name,
    })
    .from(taskNotes)
    .innerJoin(users, eq(taskNotes.user_id, users.id))
    .where(
      sql`${taskNotes.task_id} IN (${sql.join(
        taskIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .orderBy(taskNotes.created_at);

  const enriched = notes.map((n) => ({
    ...n,
    is_client_visible: Boolean(n.is_client_visible),
    task_title: taskTitleMap[n.task_id] ?? "Unknown Task",
  }));

  return NextResponse.json({ notes: enriched });
}
