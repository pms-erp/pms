// app/api/client/tasks/[id]/related/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { tasks, users, clientProjects, projects } from "@/db/schema";
import { eq, and, ne, asc } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get current task's project
  const currentTaskRows = await db
    .select({
      task: tasks,
      project: projects,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .where(eq(tasks.id, id))
    .limit(1);

  if (currentTaskRows.length === 0) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { project } = currentTaskRows[0];

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify client has access to this project
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

  // Get other tasks in same project (excluding current task)
  const relatedTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      team_type: tasks.team_type,
      created_at: tasks.created_at,
      assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigned_to, users.id))
    .where(and(eq(tasks.project_id, project.id), ne(tasks.id, id)))
    .orderBy(asc(tasks.created_at))
    .limit(10);

  const formatted = relatedTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    team_type: t.team_type,
    assignedUserName: t.assigneeName,
    created_at: t.created_at,
  }));

  return NextResponse.json({ tasks: formatted });
}
