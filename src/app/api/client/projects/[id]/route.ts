// app/api/client/projects/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projects, tasks, users, clientProjects, taskNotes } from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────
type ProjectTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  team_type: string;
  assigned_to: string | null;
  assignedUserName: string | null;
  assignedUserAvatar: string | null;
  qa_assigned_to: string | null;
  qaAssignedUserName: string | null;
  qaAssignedUserAvatar: string | null;
  estimated_minutes: number | null;
  due_date: Date | null;
  rework_count: number;
  created_at: Date;
  updated_at: Date | null;
  files: string | null;
};

type TaskComment = {
  id: string;
  task_id: string;
  note: string;
  note_type: string | null;
  created_at: Date;
  commenterName: string | null;
  commenterAvatar: string | null;
};

type ProjectStats = {
  total: number;
  approved: number;
  in_progress: number;
  waiting_qa: number;
  rework: number;
  completion_percent: number;
};

type ProjectResponse = {
  project: typeof projects.$inferSelect;
  tasks: ProjectTask[];
  comments: TaskComment[];
  stats: ProjectStats;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Check if client has access to this project
  const accessCheck = await db
    .select()
    .from(clientProjects)
    .where(
      and(
        eq(clientProjects.project_id, id),
        eq(clientProjects.client_id, session.user.id),
      ),
    )
    .limit(1);

  if (accessCheck.length === 0) {
    return NextResponse.json(
      { error: "Project not found or access denied" },
      { status: 404 },
    );
  }

  // 2. Get project details
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (projectRows.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project = projectRows[0];

  // 3. Get all tasks for this project
  const projectTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      team_type: tasks.team_type,
      assigned_to: tasks.assigned_to,
      assignedUserName: users.name,
      assignedUserAvatar: users.avatar,
      qa_assigned_to: tasks.qa_assigned_to,
      qaAssignedUserName: sql<string | null>`(
        SELECT u2.name FROM users u2 WHERE u2.id = ${tasks.qa_assigned_to} LIMIT 1
      )`,
      qaAssignedUserAvatar: sql<string | null>`(
        SELECT u2.avatar FROM users u2 WHERE u2.id = ${tasks.qa_assigned_to} LIMIT 1
      )`,
      estimated_minutes: tasks.estimated_minutes,
      due_date: tasks.due_date,
      rework_count: tasks.rework_count,
      created_at: tasks.created_at,
      updated_at: tasks.updated_at,
      files: tasks.files,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigned_to, users.id))
    .where(eq(tasks.project_id, id));

  // 4. Get client-visible comments for these tasks
  const taskIds = projectTasks.map((t) => t.id);
  let comments: TaskComment[] = [];

  if (taskIds.length > 0) {
    comments = await db
      .select({
        id: taskNotes.id,
        task_id: taskNotes.task_id,
        note: taskNotes.note,
        note_type: taskNotes.note_type,
        created_at: taskNotes.created_at,
        commenterName: users.name,
        commenterAvatar: users.avatar,
      })
      .from(taskNotes)
      .leftJoin(users, eq(taskNotes.user_id, users.id))
      .where(
        and(
          inArray(taskNotes.task_id, taskIds),
          eq(taskNotes.is_client_visible, true),
        ),
      );
  }

  // 5. Calculate stats
  const stats: ProjectStats = {
    total: projectTasks.length,
    approved: projectTasks.filter((t) => t.status === "APPROVED").length,
    in_progress: projectTasks.filter((t) => t.status === "IN_PROGRESS").length,
    waiting_qa: projectTasks.filter((t) => t.status === "WAITING_FOR_QA")
      .length,
    rework: projectTasks.filter((t) => t.status === "REWORK").length,
    completion_percent:
      projectTasks.length > 0
        ? Math.round(
            (projectTasks.filter((t) => t.status === "APPROVED").length /
              projectTasks.length) *
              100,
          )
        : 0,
  };

  return NextResponse.json({
    project,
    tasks: projectTasks,
    comments,
    stats,
  });
}
