// src/lib/tasks/service.ts
import { db } from "@/db";
import {
  tasks,
  projects,
  users,
  taskViewers,
  clientProjects,
} from "@/db/schema";
import { eq, and, or, like, sql, desc, inArray } from "drizzle-orm";
import { GetTasksOptions, PaginatedResult, TaskStats } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskListItem = {
  id: string;
  title: string;
  project_id: string | null;
  projectName: string | null;
  team_type: string | null;
  priority: string | null;
  status: string;
  estimated_minutes: number | null;
  assigned_to: string | null;
  assignedUserName: string | null;
  assignedByUsername: string | null;
  assignedUserAvatar: string | null;
  qa_assigned_to: string | null;
  qaAssignedUserName: string | null;
  due_date: Date | null;
  created_at: Date;
  viewer_count?: number;
};

export type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  team_type: string | null;
  priority: string | null;
  status: string;
  estimated_minutes: number | null;
  assigned_to: string | null;
  assigned_by: string | null;
  qa_assigned_to: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  rework_count: number | null;
  created_at: Date;
  updated_at: Date;
  projectName: string | null;
};

// ─── Helper: get team leader's team_type ──────────────────────────────────────
// Used to build the correct RBAC filter for team leaders.
// We fetch it once and pass it down, or fall back to a subquery.

function teamLeaderTaskFilter(userId: string, teamType: string | null) {
  const viewerCondition = sql`${tasks.id} IN (
    SELECT tv.task_id FROM task_viewers tv WHERE tv.user_id = ${userId}
  )`;

  if (teamType) {
    // Filter: tasks assigned to anyone on the team leader's team
    return or(
      sql`${tasks.assigned_to} IN (
        SELECT id FROM \`users\` WHERE team_type = ${teamType} AND is_active = 1
      )`,
      viewerCondition,
    );
  }

  // Fallback: tasks the team leader assigned themselves
  return or(eq(tasks.assigned_by, userId), viewerCondition);
}

// ─── getTasks ─────────────────────────────────────────────────────────────────

export async function getTasks(
  options: GetTasksOptions & { userTeamType?: string | null },
): Promise<PaginatedResult<TaskListItem>> {
  const {
    userId,
    role,
    userTeamType,
    status,
    teamType,
    search,
    projectId,
    priority,
    page = 1,
    limit = 10,
  } = options;

  const filters = [];
  const viewerCondition = sql`${tasks.id} IN (
    SELECT tv.task_id FROM task_viewers tv WHERE tv.user_id = ${userId}
  )`;

  // ── RBAC ──────────────────────────────────────────────────────────────────
  if (role === "ADMIN" || role === "PROJECT_MANAGER") {
    // ✅ See all tasks — no user filter
  } else if (role === "TEAM_LEADER") {
    const f = teamLeaderTaskFilter(userId, userTeamType ?? null);
    if (f) filters.push(f);
  } else if (role === "QA") {
    // ✅ QA sees ONLY tasks assigned to them OR where they're a viewer
    filters.push(or(eq(tasks.qa_assigned_to, userId), viewerCondition));
  } else {
    // Regular users see their own tasks
    filters.push(
      or(
        eq(tasks.assigned_to, userId),
        eq(tasks.assigned_by, userId),
        viewerCondition,
      ),
    );
  }

  // ── Additional filters ────────────────────────────────────────────────────
  if (status) filters.push(eq(tasks.status, status));
  if (teamType)
    filters.push(
      eq(tasks.team_type, teamType as "DEVELOPER" | "DESIGNER" | "PROGRAMMER"),
    );
  if (priority)
    filters.push(eq(tasks.priority, priority as "LOW" | "MEDIUM" | "HIGH"));
  if (projectId) filters.push(eq(tasks.project_id, projectId));
  if (search) {
    filters.push(
      or(
        like(tasks.title, `%${search}%`),
        like(tasks.description, `%${search}%`),
      ),
    );
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  // ── Count ─────────────────────────────────────────────────────────────────
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(whereClause);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  // ── Query ─────────────────────────────────────────────────────────────────
  const data: TaskListItem[] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      project_id: tasks.project_id,
      projectName: projects.name,
      team_type: tasks.team_type,
      priority: tasks.priority,
      status: tasks.status,
      estimated_minutes: tasks.estimated_minutes,
      assigned_to: tasks.assigned_to,
      assignedUserName: users.name,
      assignedByUsername: users.username,
      assignedUserAvatar: users.avatar,
      qa_assigned_to: tasks.qa_assigned_to,
      due_date: tasks.due_date,
      qaAssignedUserName: sql<string | null>`(
        SELECT u2.name FROM \`users\` u2
        WHERE u2.id = ${tasks.qa_assigned_to}
        LIMIT 1
      )`,
      created_at: tasks.created_at,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .leftJoin(users, eq(tasks.assigned_to, users.id))
    .where(whereClause)
    .orderBy(desc(tasks.created_at))
    .limit(limit)
    .offset(offset);

  // Attach viewer counts in one query
  if (data.length > 0) {
    const taskIds = data.map((t) => t.id);
    const viewerCounts = await db
      .select({
        task_id: taskViewers.task_id,
        cnt: sql<number>`count(*)`,
      })
      .from(taskViewers)
      .where(inArray(taskViewers.task_id, taskIds))
      .groupBy(taskViewers.task_id);

    const countMap = new Map(
      viewerCounts.map((r) => [r.task_id, Number(r.cnt)]),
    );
    for (const task of data) {
      task.viewer_count = countMap.get(task.id) ?? 0;
    }
  }

  return { data, total, page, totalPages };
}

// ─── getTaskStats ─────────────────────────────────────────────────────────────
export async function getTaskStats(
  userId: string,
  role: string,
  teamType?: string | null,
): Promise<TaskStats> {
  const filters = [];
  const viewerCondition = sql`${tasks.id} IN (
    SELECT tv.task_id FROM task_viewers tv WHERE tv.user_id = ${userId}
  )`;

  // ── RBAC: Determine which tasks to count ─────────────────────────────
  if (role === "ADMIN" || role === "PROJECT_MANAGER") {
    // ✅ Admin & PM see ALL tasks
  } else if (role === "TEAM_LEADER") {
    const f = teamLeaderTaskFilter(userId, teamType ?? null);
    if (f) filters.push(f);
  } else if (role === "QA") {
    // ✅ QA sees ONLY tasks assigned to them OR where they're a viewer
    filters.push(or(eq(tasks.qa_assigned_to, userId), viewerCondition));
  } else {
    // Regular users see their own tasks
    filters.push(
      or(
        eq(tasks.assigned_to, userId),
        eq(tasks.assigned_by, userId),
        viewerCondition,
      ),
    );
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      inProgress: sql<number>`sum(case when ${tasks.status} = 'IN_PROGRESS' then 1 else 0 end)`,
      waitingForQa: sql<number>`sum(case when ${tasks.status} = 'WAITING_FOR_QA' then 1 else 0 end)`,
      approved: sql<number>`sum(case when ${tasks.status} = 'APPROVED' then 1 else 0 end)`,
      rework: sql<number>`sum(case when ${tasks.status} = 'REWORK' then 1 else 0 end)`,
    })
    .from(tasks)
    .where(whereClause);

  // Project viewer tasks
  const [pvStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(
      sql`${tasks.project_id} IN (
        SELECT project_id FROM project_viewers WHERE user_id = ${userId}
      )`,
    );

  return {
    total: stats?.total ?? 0,
    inProgress: stats?.inProgress ?? 0,
    waitingForQa: stats?.waitingForQa ?? 0,
    approved: stats?.approved ?? 0,
    rework: stats?.rework ?? 0,
    projectViewerTasks: Number(pvStats?.count ?? 0),
  };
}

// ─── getTaskById ──────────────────────────────────────────────────────────────

export async function getTaskById(
  taskId: string,
  userId: string,
  role: string,
  teamType?: string | null,
): Promise<TaskDetail | null> {
  const task: TaskDetail | undefined = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      project_id: tasks.project_id,
      team_type: tasks.team_type,
      priority: tasks.priority,
      status: tasks.status,
      estimated_minutes: tasks.estimated_minutes,
      assigned_to: tasks.assigned_to,
      assigned_by: tasks.assigned_by,
      qa_assigned_to: tasks.qa_assigned_to,
      started_at: tasks.started_at,
      completed_at: tasks.completed_at,
      rework_count: tasks.rework_count,
      created_at: tasks.created_at,
      updated_at: tasks.updated_at,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .where(eq(tasks.id, taskId))
    .then((res) => res[0]);

  if (!task) return null;

  // ✅ NEW: CLIENT access check via client_projects
  if (role === "CLIENT") {
    if (!task.project_id) return null;

    const access = await db
      .select()
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.client_id, userId),
          eq(clientProjects.project_id, task.project_id),
        ),
      )
      .limit(1);

    if (access.length === 0) return null;

    // Client has access, return the task
    return task;
  }

  // Existing staff RBAC paths
  if (role === "ADMIN" || role === "PROJECT_MANAGER") {
    // Full access
  } else if (role === "TEAM_LEADER") {
    // Team leader can see any task assigned to someone on their team (by team_type)
    let canAccess = false;

    if (teamType && task.assigned_to) {
      // Check if the assignee is on this team leader's team
      const assigneeRow = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, task.assigned_to), eq(users.team_type, teamType)),
        )
        .limit(1);
      canAccess = assigneeRow.length > 0;
    }

    // Also allow if they assigned the task themselves
    if (!canAccess && task.assigned_by === userId) canAccess = true;

    // Also allow if they are an explicit viewer
    if (!canAccess) {
      const [viewerRow] = await db
        .select({ id: taskViewers.id })
        .from(taskViewers)
        .where(
          and(eq(taskViewers.task_id, taskId), eq(taskViewers.user_id, userId)),
        )
        .limit(1);
      if (viewerRow) canAccess = true;
    }

    if (!canAccess) return null;
  } else if (role === "QA") {
    if (task.qa_assigned_to !== userId) {
      const [viewerRow] = await db
        .select({ id: taskViewers.id })
        .from(taskViewers)
        .where(
          and(eq(taskViewers.task_id, taskId), eq(taskViewers.user_id, userId)),
        )
        .limit(1);
      if (!viewerRow) return null;
    }
  } else {
    // Regular users — must be assignee, assigner, or explicit viewer
    const isAssigned =
      task.assigned_to === userId || task.assigned_by === userId;
    if (!isAssigned) {
      const [viewerRow] = await db
        .select({ id: taskViewers.id })
        .from(taskViewers)
        .where(
          and(eq(taskViewers.task_id, taskId), eq(taskViewers.user_id, userId)),
        )
        .limit(1);
      if (!viewerRow) return null;
    }
  }

  return task;
}
