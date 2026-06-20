import { db } from "@/db";
import {
  projects,
  tasks,
  users,
  projectViewers,
  clientProjects,
} from "@/db/schema";
import { eq, sql, and, like, desc, or } from "drizzle-orm";
import { GetProjectsOptions, PaginatedResult, ProjectStatus } from "./types";

// ── RBAC helper ───────────────────────────────────────────────────────────────
type RBACResult =
  | { type: "ALL" }
  | { type: "TEAM"; teamType: string }
  | { type: "ASSIGNED"; userId: string; includeQA: boolean };

function applyProjectRBAC(
  role: string,
  userId: string,
  teamType?: string | null,
): RBACResult {
  // ✅ FIXED: QA, ADMIN, PROJECT_MANAGER see ALL projects
  if (role === "ADMIN" || role === "PROJECT_MANAGER" || role === "QA") {
    return { type: "ALL" };
  }

  // TEAM_LEADER sees projects they created OR projects with their team's tasks
  if (role === "TEAM_LEADER" && teamType) {
    return { type: "TEAM", teamType };
  }

  // All other roles (DEVELOPER, DESIGNER, PROGRAMMER, etc.) see only assigned projects
  return { type: "ASSIGNED", userId, includeQA: false };
}

// ── SQL fragments ─────────────────────────────────────────────────────────────

const teamProjectsSubquery = (teamType: string) =>
  sql`${projects.id} IN (
    SELECT t.project_id FROM tasks t
    INNER JOIN users u ON t.assigned_to = u.id
    WHERE u.team_type = ${teamType}
  )`;

// Replace your existing assignedProjectsSubquery with this:
const assignedProjectsSubquery = (userId: string, includeQA = false) =>
  includeQA
    ? sql`(
        ${projects.id} IN (
          SELECT project_id FROM tasks
          WHERE assigned_to = ${userId} OR qa_assigned_to = ${userId}
        )
        OR ${projects.id} IN (
          SELECT project_id FROM project_viewers WHERE user_id = ${userId}
        )
      )`
    : sql`(
        ${projects.id} IN (
          SELECT project_id FROM tasks
          WHERE assigned_to = ${userId}
             OR assigned_by = ${userId}
             OR id IN (SELECT task_id FROM task_viewers WHERE user_id = ${userId})
        )
        OR ${projects.id} IN (
          SELECT project_id FROM project_viewers WHERE user_id = ${userId}
        )
      )`;

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectListItem = {
  id: string;
  name: string;
  client_name: string | null;
  status: ProjectStatus;
  created_at: Date;
  taskCount: number;
};

const projectSelect = {
  id: projects.id,
  name: projects.name,
  client_name: projects.client_name,
  website_url: projects.website_url,
  fiverr_order_id: projects.fiverr_order_id,
  body: projects.body,
  files: projects.files,
  status: projects.status,
  created_by: projects.created_by,
  created_at: projects.created_at,
  updated_at: projects.updated_at,
};

// ── getProjects ───────────────────────────────────────────────────────────────

export async function getProjects(
  options: GetProjectsOptions & { teamType?: string | null; search?: string },
): Promise<PaginatedResult<ProjectListItem>> {
  const { userId, role, teamType, page, limit, status, search } = options;
  const rbac = applyProjectRBAC(role, userId, teamType);

  const filters = [];
  if (rbac.type === "TEAM")
    filters.push(
      or(
        teamProjectsSubquery(rbac.teamType),
        sql`${projects.id} IN (SELECT project_id FROM project_viewers WHERE user_id = ${userId})`,
      ),
    );
  else if (rbac.type === "ASSIGNED")
    filters.push(assignedProjectsSubquery(rbac.userId, rbac.includeQA));

  if (status) filters.push(eq(projects.status, status));
  if (search?.trim()) filters.push(like(projects.name, `%${search.trim()}%`));

  const whereClause = filters.length ? and(...filters) : undefined;

  const selectFields = {
    id: projects.id,
    name: projects.name,
    client_name: projects.client_name,
    status: projects.status,
    created_at: projects.created_at,
    taskCount: sql<number>`count(${tasks.id})`,
  };

  const baseQuery = db
    .select(selectFields)
    .from(projects)
    .leftJoin(tasks, eq(tasks.project_id, projects.id))
    .where(whereClause)
    .groupBy(projects.id)
    .orderBy(desc(projects.created_at));
  let data: ProjectListItem[];

  if (limit) {
    // Server-side paging — only used for sidebar previews (?limit=5)
    const offset = ((page ?? 1) - 1) * limit;
    data = await baseQuery.limit(limit).offset(offset);
  } else {
    // No limit → return ALL rows; DataTable does client-side pagination
    data = await baseQuery;
  }

  const total = data.length;
  const totalPages = limit ? Math.ceil(total / limit) : 1;

  return { data, total, page: page ?? 1, totalPages };
}

// ── getProjectById ────────────────────────────────────────────────────────────

export async function getProjectById(
  projectId: string,
  userId: string,
  role: string,
  teamType?: string | null,
) {
  let project;

  // ✅ NEW: CLIENT access check via client_projects table
  if (role === "CLIENT") {
    const [row] = await db
      .select({ ...projectSelect })
      .from(clientProjects)
      .innerJoin(projects, eq(clientProjects.project_id, projects.id))
      .where(
        and(eq(clientProjects.client_id, userId), eq(projects.id, projectId)),
      );

    if (!row) return null;
    project = row;
  }
  // Existing staff RBAC paths
  else if (role === "ADMIN" || role === "PROJECT_MANAGER" || role === "QA") {
    project = await db
      .select(projectSelect)
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((r) => r[0]);
  } else if (role === "TEAM_LEADER" && teamType) {
    project = await db
      .select(projectSelect)
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          or(
            teamProjectsSubquery(teamType),
            sql`${projects.id} IN (SELECT project_id FROM project_viewers WHERE user_id = ${userId})`,
          ),
        ),
      )
      .then((r) => r[0]);
  } else {
    project = await db
      .select(projectSelect)
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          assignedProjectsSubquery(userId, false),
        ),
      )
      .then((r) => r[0]);
  }

  if (!project) return null;

  const [taskStats] = await db
    .select({
      total: sql<number>`count(*)`,
      completed: sql<number>`sum(case when ${tasks.status} = 'APPROVED' then 1 else 0 end)`,
    })
    .from(tasks)
    .where(eq(tasks.project_id, projectId));

  const total = Number(taskStats?.total ?? 0);
  const completed = Number(taskStats?.completed ?? 0);
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { ...project, progress, totalTasks: total, completedTasks: completed };
}

// ── getProjectTasks ───────────────────────────────────────────────────────────

export async function getProjectTasks(
  projectId: string,
  userId: string,
  role: string,
  teamType?: string | null,
) {
  // ✅ NEW: For clients, verify access first, then return ALL tasks in the project
  if (role === "CLIENT") {
    const hasAccess = await db
      .select()
      .from(clientProjects)
      .where(
        and(
          eq(clientProjects.client_id, userId),
          eq(clientProjects.project_id, projectId),
        ),
      )
      .limit(1);

    if (hasAccess.length === 0) return [];
  }

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description, // ← needed for task detail
      team_type: tasks.team_type,
      status: tasks.status,
      priority: tasks.priority,
      assigned_to: tasks.assigned_to,
      assigned_by: tasks.assigned_by,
      due_date: tasks.due_date, // ← needed for task detail
      rework_count: tasks.rework_count, // ← needed for task detail
      created_at: tasks.created_at,
      assignedUserName: users.name,
      assignedUserAvatar: users.avatar,
      assignedByUsername: users.username,
      estimated_minutes: tasks.estimated_minutes,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assigned_to, users.id))
    .where(eq(tasks.project_id, projectId));
}
