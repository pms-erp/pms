// src/app/api/client/tasks/[id]/comments/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes, users, tasks, clientProjects, projects } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Get task and verify client access
  const taskWithProject = await db
    .select({
      task: tasks,
      project: projects,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .where(eq(tasks.id, id))
    .limit(1);

  if (taskWithProject.length === 0) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { project } = taskWithProject[0];

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // 2. Verify client has access to this project
  const clientAccess = await db
    .select()
    .from(clientProjects)
    .where(
      and(
        eq(clientProjects.project_id, project.id),
        eq(clientProjects.client_id, session.user.id),
      ),
    )
    .limit(1);

  if (clientAccess.length === 0) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // 3. Get ALL comments with metadata (including attachments)
  const comments = await db
    .select({
      id: taskNotes.id,
      task_id: taskNotes.task_id,
      note: taskNotes.note,
      note_type: taskNotes.note_type,
      metadata: taskNotes.metadata, // ← ADD THIS to get attachments
      created_at: taskNotes.created_at,
      commenterName: users.name,
      commenterAvatar: users.avatar,
    })
    .from(taskNotes)
    .leftJoin(users, eq(taskNotes.user_id, users.id))
    .where(eq(taskNotes.task_id, id))
    .orderBy(taskNotes.created_at);

  return NextResponse.json({ comments });
}
