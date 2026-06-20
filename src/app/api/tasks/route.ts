// app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  tasks,
  users,
  projects,
  notifications,
  pushSubscriptions,
  attendanceLocations, // ✅ Added import
} from "@/db/schema";
import { eq, or, and, like, desc, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { sendEmail, buildTaskAssignedEmail } from "@/lib/email";
import { sendPushNotification } from "@/lib/push/utils";

// ── GET /api/tasks ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Number(searchParams.get("limit") ?? 20));
    const offset = (page - 1) * limit;
    const status = searchParams.get("status") ?? "";
    const team = searchParams.get("team") ?? "";
    const priority = searchParams.get("priority") ?? "";
    const search = searchParams.get("search") ?? "";
    const projectViewer = searchParams.get("projectViewer") === "true";

    const role = session.user.role;
    const userId = session.user.id;
    const viewerCondition = sql`${tasks.id} IN (
      SELECT tv.task_id FROM task_viewers tv WHERE tv.user_id = ${userId}
    )`;

    const filters = [];

    // RBAC: filter tasks based on role
    if (role === "ADMIN" || role === "PROJECT_MANAGER") {
      // ✅ see everything — no filter
    } else if (role === "TEAM_LEADER") {
      // see all tasks assigned to any member of their team
      const teamType = session.user.team_type ?? null;
      if (teamType) {
        filters.push(
          or(
            sql`${tasks.assigned_to} IN (
          SELECT id FROM users WHERE team_type = ${teamType} AND is_active = true
        )`,
            viewerCondition,
          ),
        );
      } else {
        // no team assigned yet — only viewer access remains
        filters.push(viewerCondition);
      }
    } else if (role === "QA") {
      // ✅ QA sees ONLY tasks assigned to them OR where they're a viewer
      filters.push(or(eq(tasks.qa_assigned_to, userId), viewerCondition));
    } else {
      // Regular members see: tasks assigned to them, tasks they assigned,
      // OR tasks where they are added as a viewer
      filters.push(
        or(
          eq(tasks.assigned_to, userId),
          eq(tasks.assigned_by, userId),
          viewerCondition,
        ),
      );
    }
    if (projectViewer) {
      filters.length = 0; // clear RBAC filters
      filters.push(
        sql`${tasks.project_id} IN (
      SELECT project_id FROM project_viewers WHERE user_id = ${userId}
    )`,
      );
    }

    if (status)
      filters.push(
        eq(
          tasks.status,
          status as "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK",
        ),
      );
    if (team) filters.push(eq(tasks.team_type, team));
    if (priority)
      filters.push(eq(tasks.priority, priority as "LOW" | "MEDIUM" | "HIGH"));
    if (search) filters.push(like(tasks.title, `%${search}%`));

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(where);

    const total = Number(count);
    const totalPages = Math.ceil(total / limit);

    // ✅ Updated select to include assignee's location info
    const rows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        priority: tasks.priority,
        team_type: tasks.team_type,
        estimated_minutes: tasks.estimated_minutes,
        created_at: tasks.created_at,
        project_id: tasks.project_id,
        assigned_to: tasks.assigned_to,
        assigned_by: tasks.assigned_by,
        qa_assigned_to: tasks.qa_assigned_to,
        due_date: tasks.due_date,
        projectName: projects.name,
        assignedUserName: users.name,
        assignedUserAvatar: users.avatar,
        // ✅ Added location fields from users table
        assignedUserLocationId: users.location_id,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.project_id, projects.id))
      .leftJoin(users, eq(tasks.assigned_to, users.id))
      .where(where)
      .orderBy(desc(tasks.created_at))
      .limit(limit)
      .offset(offset);

    // Fetch QA user names separately to avoid join alias conflict
    const qaIds = [
      ...new Set(rows.map((r) => r.qa_assigned_to).filter(Boolean)),
    ] as string[];
    const qaUsers = qaIds.length
      ? await db
          .select({ id: users.id, name: users.name, avatar: users.avatar })
          .from(users)
          .where(
            sql`${users.id} IN (${sql.join(
              qaIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : [];
    const qaMap = Object.fromEntries(
      qaUsers.map((u) => [u.id, { name: u.name, avatar: u.avatar ?? null }]),
    );

    // Fetch assigner usernames
    const assignerIds = [...new Set(rows.map((r) => r.assigned_by))];
    const assigners = assignerIds.length
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(
            sql`${users.id} IN (${sql.join(
              assignerIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : [];
    const assignerMap = Object.fromEntries(
      assigners.map((a) => [a.id, a.username]),
    );

    // ✅ Fetch location names for assignees who have location_id set
    const locationIds = [
      ...new Set(rows.map((r) => r.assignedUserLocationId).filter(Boolean)),
    ] as string[];
    const locations = locationIds.length
      ? await db
          .select({
            id: attendanceLocations.id,
            name: attendanceLocations.name,
          })
          .from(attendanceLocations)
          .where(
            sql`${attendanceLocations.id} IN (${sql.join(
              locationIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
      : [];
    const locationMap = Object.fromEntries(
      locations.map((loc) => [loc.id, loc.name]),
    );

    const data = rows.map((r) => ({
      ...r,
      assignedByUsername: assignerMap[r.assigned_by] ?? null,
      qaAssignedUserName: r.qa_assigned_to
        ? (qaMap[r.qa_assigned_to]?.name ?? null)
        : null,
      qaAssignedUserAvatar: r.qa_assigned_to
        ? (qaMap[r.qa_assigned_to]?.avatar ?? null)
        : null,
      // ✅ Include location name for frontend display
      assignedUserLocationName: r.assignedUserLocationId
        ? (locationMap[r.assignedUserLocationId] ?? null)
        : null,
    }));

    return NextResponse.json({ data, total, page, totalPages });
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 },
    );
  }
}

// ── POST /api/tasks ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      project_id,
      team_type,
      title,
      description,
      priority,
      assigned_to,
      estimated_minutes,
      files,
      // ✅ location_id is NOT needed here - it's on the user, not the task
    } = body;

    if (!project_id || !team_type || !title || !priority || !assigned_to) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const taskId = uuid();

    await db.insert(tasks).values({
      id: taskId,
      project_id,
      team_type,
      title,
      description: description || null,
      priority,
      assigned_by: session.user.id,
      assigned_to,
      estimated_minutes: estimated_minutes ? Number(estimated_minutes) : null,
      status: "IN_PROGRESS",
      files: files || null,
      started_at: new Date(),
      // ✅ No location_id field on tasks - location is user-level
    });

    // Fire-and-forget — never blocks the response
    sendTaskNotifications({
      taskId,
      assignedTo: assigned_to,
      assignedById: session.user.id,
      assignedByName: session.user.name ?? "Someone",
      taskTitle: title,
      taskDescription: description,
      priority,
      projectId: project_id,
    }).catch((err) => console.error("[notify] task assigned failed:", err));

    return NextResponse.json({ success: true, id: taskId });
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}

// ── Notification helper — writes to DB + push + email directly ────────────────
// Does NOT make an internal HTTP fetch (which would fail with 401 — no session)
async function sendTaskNotifications({
  taskId,
  assignedTo,
  assignedById,
  assignedByName,
  taskTitle,
  taskDescription,
  priority,
  projectId,
}: {
  taskId: string;
  assignedTo: string;
  assignedById: string;
  assignedByName: string;
  taskTitle: string;
  taskDescription?: string;
  priority: string;
  projectId: string;
}) {
  const notifTitle = "New Task Assigned";
  const notifMessage = `${assignedByName} assigned to team: "${taskTitle}"`;

  // ── 1. Find assignee's team_type so we can notify their team leader ──────────
  const assigneeRow = await db
    .select({ team_type: users.team_type, location_id: users.location_id }) // ✅ Added location_id
    .from(users)
    .where(eq(users.id, assignedTo))
    .limit(1)
    .then((r) => r[0] ?? null);

  const assigneeTeamType = assigneeRow?.team_type ?? null;
  const assigneeLocationId = assigneeRow?.location_id ?? null; // ✅ Capture location

  // ── 2. Find ADMIN + PROJECT_MANAGER users ────────────────────────────────────
  const privilegedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.is_active, true),
        sql`${users.role} IN ('ADMIN', 'PROJECT_MANAGER')`,
      ),
    );

  const privilegedIds = privilegedUsers.map((u) => u.id);

  // ── 3. Find the TEAM_LEADER of the assignee's team ───────────────────────────
  let teamLeaderIds: string[] = [];
  if (assigneeTeamType) {
    const teamLeaders = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.is_active, true),
          eq(users.role, "TEAM_LEADER"),
          eq(users.team_type, assigneeTeamType),
        ),
      );
    teamLeaderIds = teamLeaders.map((u) => u.id);
  }

  // Notify: assignee + admins/PMs + team leader (deduped)
  const notifyUserIds = [
    ...new Set([assignedTo, ...privilegedIds, ...teamLeaderIds]),
  ];

  // ── 4. Insert DB notifications directly (no HTTP hop) ───────────────────────
  await Promise.allSettled(
    notifyUserIds.map(async (userId) => {
      try {
        const existing = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.user_id, userId),
              eq(notifications.task_id, taskId),
              eq(notifications.type, "TASK_ASSIGNED"),
              eq(notifications.is_read, false),
            ),
          )
          .limit(1);

        if (existing.length > 0) return;

        // Personalise message: assignee gets "assigned to you", everyone else gets team context
        const isAssignee = userId === assignedTo;
        const locationNote = assigneeLocationId ? " (location-restricted)" : "";
        const message = isAssignee
          ? `${assignedByName} assigned you a task: "${taskTitle}"${locationNote}`
          : `${assignedByName} assigned a task to your team: "${taskTitle}"${locationNote}`;

        await db.insert(notifications).values({
          id: uuid(),
          user_id: userId,
          task_id: taskId,
          type: "TASK_ASSIGNED",
          title: notifTitle,
          message,
          is_read: false,
        });
      } catch (err) {
        console.error(`[notify] DB insert failed for user ${userId}:`, err);
      }
    }),
  );

  // ── 3. Send push notification to assignee only ───────────────────────────────
  try {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.user_id, assignedTo));

    await Promise.allSettled(
      subs.map((sub) =>
        sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          {
            title: notifTitle,
            body: notifMessage,
            data: { taskId, type: "TASK_ASSIGNED", url: `/tasks/${taskId}` },
          },
        ),
      ),
    );
  } catch (err) {
    console.error("[push] task assigned push failed:", err);
  }

  // ── 4. Send email to assignee only ──────────────────────────────────────────
  try {
    const [assigneeRow, projectRow] = await Promise.all([
      db
        .select({
          name: users.name,
          email: users.email,
          location_id: users.location_id,
        }) // ✅ Added location_id
        .from(users)
        .where(eq(users.id, assignedTo))
        .limit(1)
        .then((r) => r[0] ?? null),
      db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

    // Debug log — check your server terminal to see if email is set
    console.log(
      `[email] assignee: ${assigneeRow?.name} | email: ${assigneeRow?.email ?? "NOT SET — go to Users page and add their email"}`,
    );

    if (!assigneeRow?.email) {
      console.warn(
        `[email] SKIPPED — user "${assigneeRow?.name}" (id: ${assignedTo}) has no email address set. Add it in the Users page.`,
      );
      return;
    }

    const { subject, html } = buildTaskAssignedEmail({
      assigneeName: assigneeRow.name,
      assignerName: assignedByName,
      taskTitle,
      taskDescription,
      projectName: projectRow?.name,
      priority,
      taskUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/tasks/${taskId}`,
      // ✅ Optionally include location info in email
      locationName: assigneeRow.location_id
        ? "Location-restricted task"
        : undefined,
    });

    await sendEmail({ to: assigneeRow.email, subject, html });
    console.log(`[email] sent to ${assigneeRow.email}`);
  } catch (err) {
    console.error("[email] task assigned email failed:", err);
  }
}
