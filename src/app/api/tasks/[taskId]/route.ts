import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { tasks, users, projects } from "@/db/schema";
import { eq, sql, SQL } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";
import { sendEmail, buildTaskAssignedEmail } from "@/lib/email";
import { broadcastTaskUpdate } from "./events/route";
import { pusherServer } from "@/lib/pusher";

type TaskStatus = "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK";
type Priority = "LOW" | "MEDIUM" | "HIGH";

type PatchContext =
  | { params: { taskId: string } }
  | { params: Promise<{ taskId: string }> };

type TaskUpdateBody = {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  team_type?: string;
  estimated_minutes?: number | string | null;
  files?: string | object | null;
  assigned_to?: string | null;
  qa_assigned_to?: string | null;
  qa_assigned_at?: string | null;
  rework_count?: number;
};

type UpdateTaskData = {
  updated_at: Date;
  title?: string;
  description?: string;
  priority?: Priority;
  status?: TaskStatus;
  team_type?: string;
  estimated_minutes?: number | null;
  files?: string | null;
  assigned_to?: string | SQL;
  qa_assigned_to?: string | null;
  qa_assigned_at?: Date | null;
  rework_count?: number;
};

type ExtractTaskIdContext =
  | {
      params?:
        | { [key: string]: unknown; taskId?: string }
        | Promise<{ [key: string]: unknown; taskId?: string }>;
    }
  | undefined;

type CloudinaryFile = {
  public_id?: string;
  [key: string]: unknown;
};

const ALLOWED_STATUSES: TaskStatus[] = [
  "IN_PROGRESS",
  "WAITING_FOR_QA",
  "APPROVED",
  "REWORK",
];
const ALLOWED_PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH"];

function isValidStatus(status: string): status is TaskStatus {
  return ALLOWED_STATUSES.includes(status as TaskStatus);
}
function isValidPriority(priority: string): priority is Priority {
  return ALLOWED_PRIORITIES.includes(priority as Priority);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function extractTaskId(
  context: ExtractTaskIdContext,
): Promise<string | null> {
  if (
    context &&
    context.params &&
    typeof (context.params as Promise<unknown>).then === "function"
  ) {
    const awaitedParams = await (context.params as Promise<{
      [key: string]: unknown;
    }>);
    return (awaitedParams?.taskId as string) ?? null;
  } else if (context && context.params && typeof context.params === "object") {
    return (
      ((context.params as { [key: string]: unknown }).taskId as string) ?? null
    );
  }
  return null;
}

// ─── GET — used by task-detail polling for real-time cross-device updates ────

export async function GET(req: NextRequest, context: PatchContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await extractTaskId(context);
    if (!taskId) {
      return NextResponse.json(
        { error: "Invalid route parameter" },
        { status: 400 },
      );
    }

    const rows = await db
      .select({
        id: tasks.id,
        project_id: tasks.project_id,
        team_type: tasks.team_type,
        title: tasks.title,
        description: tasks.description,
        files: tasks.files,
        priority: tasks.priority,
        assigned_to: tasks.assigned_to,
        assigned_by: tasks.assigned_by,
        estimated_minutes: tasks.estimated_minutes,
        status: tasks.status,
        qa_assigned_to: tasks.qa_assigned_to,
        qa_assigned_at: tasks.qa_assigned_at,
        rework_count: tasks.rework_count,
        created_at: tasks.created_at,
        updated_at: tasks.updated_at,
        started_at: tasks.started_at,
        // join assignee name + avatar + project name for task-detail display
        assignedUserName: users.name,
        assignedUserAvatar: users.avatar,
        projectName: projects.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigned_to, users.id))
      .leftJoin(projects, eq(tasks.project_id, projects.id))
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const row = rows[0];

    // Fetch QA user name separately (can't join same table twice easily)
    let qaAssignedUserName: string | null = null;
    let qaAssignedUserAvatar: string | null = null;
    if (row.qa_assigned_to) {
      const qaUser = await db
        .select({ name: users.name, avatar: users.avatar })
        .from(users)
        .where(eq(users.id, row.qa_assigned_to))
        .limit(1)
        .then((r) => r[0] ?? null);
      qaAssignedUserName = qaUser?.name ?? null;
      qaAssignedUserAvatar = qaUser?.avatar ?? null;
    }

    return NextResponse.json({
      task: { ...row, qaAssignedUserName, qaAssignedUserAvatar },
    });
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json(
      { error: "Failed to fetch task" },
      { status: 500 },
    );
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, context: PatchContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await extractTaskId(context);
    if (!taskId) {
      return NextResponse.json(
        { error: "Invalid route parameter" },
        { status: 400 },
      );
    }

    const body: TaskUpdateBody = await req.json();

    const updateData: UpdateTaskData = {
      updated_at: new Date(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined)
      updateData.description = body.description;

    if (body.priority !== undefined && isValidPriority(body.priority)) {
      updateData.priority = body.priority;
    }
    if (body.status !== undefined && isValidStatus(body.status)) {
      updateData.status = body.status;
    }
    if (body.team_type !== undefined && body.team_type) {
      updateData.team_type = body.team_type;
    }

    if (body.estimated_minutes !== undefined) {
      updateData.estimated_minutes =
        body.estimated_minutes !== null && body.estimated_minutes !== ""
          ? parseInt(String(body.estimated_minutes))
          : null;
    }

    if (body.files !== undefined) {
      updateData.files =
        typeof body.files === "string"
          ? body.files
          : JSON.stringify(body.files);
    }

    if (body.assigned_to !== undefined) {
      updateData.assigned_to =
        body.assigned_to !== null ? body.assigned_to : sql`null`;
    }

    if (body.qa_assigned_to !== undefined) {
      updateData.qa_assigned_to = body.qa_assigned_to ?? null;
    }
    if (body.qa_assigned_at !== undefined) {
      updateData.qa_assigned_at = body.qa_assigned_at
        ? new Date(body.qa_assigned_at)
        : null;
    }
    if (body.rework_count !== undefined) {
      updateData.rework_count = body.rework_count;
    }

    const hasUpdates = Object.keys(updateData).some((k) => k !== "updated_at");
    if (!hasUpdates) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    await db.update(tasks).set(updateData).where(eq(tasks.id, taskId));

    const updatedTask = await db
      .select({
        id: tasks.id,
        project_id: tasks.project_id,
        team_type: tasks.team_type,
        title: tasks.title,
        description: tasks.description,
        files: tasks.files,
        priority: tasks.priority,
        assigned_to: tasks.assigned_to,
        assigned_by: tasks.assigned_by,
        estimated_minutes: tasks.estimated_minutes,
        status: tasks.status,
        qa_assigned_to: tasks.qa_assigned_to,
        qa_assigned_at: tasks.qa_assigned_at,
        rework_count: tasks.rework_count,
        created_at: tasks.created_at,
        updated_at: tasks.updated_at,
        started_at: tasks.started_at,
      })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!updatedTask || updatedTask.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const task = updatedTask[0];

    // ── Notify when task marked WAITING_FOR_QA (task completed by member) ────────
    if (body.status === "WAITING_FOR_QA") {
      sendTaskReadyNotifications({
        taskId,
        taskTitle: task.title,
        teamType: task.team_type,
        assignedTo: task.assigned_to,
      }).catch((err) => console.error("[notify] ready-for-qa failed:", err));
    }

    // ── Send email to QA if qa_assigned_to was just set ─────────────────────────
    if (body.qa_assigned_to) {
      sendQaAssignmentEmail({
        qaUserId: body.qa_assigned_to,
        taskId,
        taskTitle: task.title,
        assignerName: session.user.name ?? "Someone",
        projectId: task.project_id,
      }).catch((err) =>
        console.error("[email] QA assignment email failed:", err),
      );
    }

    await pusherServer.trigger(`task-${taskId}`, "task_updated", {
      status: task.status,
    });

    return NextResponse.json({
      success: true,
      message: "Task updated successfully",
      task,
    });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }
}

// ── Ready-for-QA notification helper ────────────────────────────────────────
async function sendTaskReadyNotifications({
  taskId,
  taskTitle,
  teamType,
  assignedTo,
}: {
  taskId: string;
  taskTitle: string;
  teamType: string;
  assignedTo: string;
}) {
  const { v4: uuid } = await import("uuid");
  const { notifications } = await import("@/db/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  const notifTitle = "Task Ready for QA";
  const notifMessage = `A task is ready for QA review: "${taskTitle}"`;

  // Collect: ADMIN + PROJECT_MANAGER + TEAM_LEADER of the task's team
  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.is_active, true),
        sql`(
          ${users.role} IN ('ADMIN', 'PROJECT_MANAGER')
          OR (${users.role} = 'TEAM_LEADER' AND ${users.team_type} = ${teamType})
        )`,
      ),
    );

  const recipientIds = [...new Set(recipients.map((u) => u.id))];

  await Promise.allSettled(
    recipientIds.map(async (userId) => {
      try {
        const existing = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.user_id, userId),
              eq(notifications.task_id, taskId),
              eq(notifications.type, "READY_FOR_ASSIGNMENT"),
              eq(notifications.is_read, false),
            ),
          )
          .limit(1);

        if (existing.length > 0) return;

        await db.insert(notifications).values({
          id: uuid(),
          user_id: userId,
          task_id: taskId,
          type: "READY_FOR_ASSIGNMENT",
          title: notifTitle,
          message: notifMessage,
          is_read: false,
        });
      } catch (err) {
        console.error(
          `[notify] ready-for-qa insert failed for ${userId}:`,
          err,
        );
      }
    }),
  );
}

// ── QA email helper ───────────────────────────────────────────────────────────
async function sendQaAssignmentEmail({
  qaUserId,
  taskId,
  taskTitle,
  assignerName,
  projectId,
}: {
  qaUserId: string;
  taskId: string;
  taskTitle: string;
  assignerName: string;
  projectId: string;
}) {
  const [qaUser, projectRow] = await Promise.all([
    db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, qaUserId))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  console.log(
    `[email] QA assignee: ${qaUser?.name} | email: ${qaUser?.email ?? "NOT SET"}`,
  );

  if (!qaUser?.email) {
    console.warn(
      `[email] SKIPPED — QA user "${qaUser?.name}" has no email set.`,
    );
    return;
  }

  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const { subject, html } = buildTaskAssignedEmail({
    assigneeName: qaUser.name,
    assignerName,
    taskTitle,
    projectName: projectRow?.name,
    priority: "MEDIUM", // QA assignments don't carry priority
    taskUrl: `${appUrl}/tasks/${taskId}`,
  });

  await sendEmail({ to: qaUser.email, subject, html });
  console.log(`[email] QA assignment email sent to ${qaUser.email}`);
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, context: PatchContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      session.user.role !== "ADMIN" &&
      session.user.role !== "PROJECT_MANAGER"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const taskId = await extractTaskId(context);
    if (!taskId) {
      return NextResponse.json(
        { error: "Invalid route parameter" },
        { status: 400 },
      );
    }

    const task = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    if (!task || task.length === 0) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task[0].files) {
      try {
        const files: CloudinaryFile[] = JSON.parse(task[0].files);
        for (const file of files) {
          if (file && file.public_id) {
            await cloudinary.uploader.destroy(file.public_id);
          }
        }
      } catch (error) {
        console.error("Error deleting files from Cloudinary:", error);
      }
    }

    await db.delete(tasks).where(eq(tasks.id, taskId));

    return NextResponse.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Delete task error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
