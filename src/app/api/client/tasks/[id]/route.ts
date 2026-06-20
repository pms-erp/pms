// src/app/api/client/tasks/[id]/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { clientProjects } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  projectName: string | null;
  team_type: string;
  priority: string;
  status: string;
  estimated_minutes: number | null;
  assigned_to: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  qa_assigned_to: string | null;
  qaName: string | null;
  qaAvatar: string | null;
  created_at: Date;
  updated_at: Date | null;
  started_at: Date | null;
  due_date: Date | null;
  rework_count: number;
  files: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "CLIENT") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await db.execute(sql`
      SELECT 
        t.id,
        t.title,
        t.description,
        t.project_id,
        t.team_type,
        t.priority,
        t.status,
        t.estimated_minutes,
        t.assigned_to,
        t.qa_assigned_to,
        t.created_at,
        t.updated_at,
        t.started_at,
        t.due_date,
        t.rework_count,
        t.files,
        p.name AS projectName,
        u.name AS assigneeName,
        u.avatar AS assigneeAvatar,
        qa.name AS qaName,
        qa.avatar AS qaAvatar
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users qa ON t.qa_assigned_to = qa.id
      WHERE t.id = ${id}
      LIMIT 1
    `);

    const rows = (result as unknown as [TaskRow[]])[0];

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Task not found", taskId: id },
        { status: 404 },
      );
    }

    const task = rows[0];

    if (!task.project_id) {
      return NextResponse.json(
        { error: "Task has no project" },
        { status: 404 },
      );
    }

    const accessCheck = await db
      .select()
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.project_id, task.project_id),
          eq(clientProjects.client_id, session.user.id),
        ),
      )
      .limit(1);

    if (accessCheck.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json({
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        project_id: task.project_id,
        projectName: task.projectName,
        team_type: task.team_type,
        priority: task.priority,
        status: task.status,
        estimated_minutes: task.estimated_minutes,
        assigned_to: task.assigned_to,
        assignedUserName: task.assigneeName,
        assignedUserAvatar: task.assigneeAvatar,
        qa_assigned_to: task.qa_assigned_to,
        qaAssignedUserName: task.qaName,
        qaAssignedUserAvatar: task.qaAvatar,
        created_at: task.created_at,
        updated_at: task.updated_at,
        started_at: task.started_at,
        due_date: task.due_date,
        rework_count: task.rework_count,
        files: task.files,
      },
    });
  } catch (error) {
    console.error("❌ Task API error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
