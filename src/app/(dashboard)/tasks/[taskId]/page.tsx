import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  tasks,
  projects,
  users,
  taskViewers,
  projectViewers,
} from "@/db/schema";
import { eq, and, or, asc, sql } from "drizzle-orm";
import { TaskDetail } from "./task-detail";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  const { id: userId, role } = session.user;

  // ── Fetch task + current user in parallel ────────────────────────────────
  const [taskData, currentUser] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        files: tasks.files,
        project_id: tasks.project_id,
        projectName: projects.name,
        team_type: tasks.team_type,
        priority: tasks.priority,
        status: tasks.status,
        estimated_minutes: tasks.estimated_minutes,
        assigned_to: tasks.assigned_to,
        assignedUserName: users.name,
        assignedByUsername: users.username,
        assigned_by: tasks.assigned_by,
        qa_assigned_to: tasks.qa_assigned_to,
        started_at: tasks.started_at,
        completed_at: tasks.completed_at,
        rework_count: tasks.rework_count,
        created_at: tasks.created_at,
        updated_at: tasks.updated_at,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.project_id, projects.id))
      .leftJoin(users, eq(tasks.assigned_to, users.id))
      .where(eq(tasks.id, taskId))
      .then((res) => res[0]),

    db
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .then((res) => res[0]),
  ]);

  if (!taskData) notFound();

  const qaUser = taskData.qa_assigned_to
    ? await db
        .select({ name: users.name, avatar: users.avatar })
        .from(users)
        .where(eq(users.id, taskData.qa_assigned_to))
        .limit(1)
        .then((res) => res[0] ?? null)
    : null;

  // ── RBAC — check if this user is allowed to see this task ─────────────────
  const isAdminOrPMOrQA =
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "QA";
  const isTeamLeader = role === "TEAM_LEADER";
  const isAssigned =
    taskData.assigned_to === userId || taskData.assigned_by === userId;
  const isQAAssigned = taskData.qa_assigned_to === userId;

  let canAccess = isAdminOrPMOrQA || isTeamLeader || isAssigned || isQAAssigned;

  // ── Check task_viewers ───────────────────────────────────────────────────
  if (!canAccess) {
    const [taskViewerRow] = await db
      .select({ id: taskViewers.id })
      .from(taskViewers)
      .where(
        and(eq(taskViewers.task_id, taskId), eq(taskViewers.user_id, userId)),
      )
      .limit(1);

    if (taskViewerRow) canAccess = true;
  }

  // ── Check project_viewers ────────────────────────────────────────────────
  if (!canAccess && taskData.project_id) {
    const [projectViewerRow] = await db
      .select({ id: projectViewers.id })
      .from(projectViewers)
      .where(
        and(
          eq(projectViewers.project_id, taskData.project_id),
          eq(projectViewers.user_id, userId),
        ),
      )
      .limit(1);

    if (projectViewerRow) canAccess = true;
  }

  // ── Check if user is a project member ───────────────────────────────────
  if (!canAccess && taskData.project_id) {
    const [projectMemberRow] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.project_id, taskData.project_id),
          or(eq(tasks.assigned_to, userId), eq(tasks.assigned_by, userId)),
        ),
      )
      .limit(1);

    if (projectMemberRow) canAccess = true;
  }

  if (!canAccess) notFound();

  // ── Fetch related tasks from same project (oldest first) ─────────────────
  const relatedTasksRaw = taskData.project_id
    ? await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          team_type: tasks.team_type,
          assigned_to: tasks.assigned_to,
          assignedUserName: users.name,
          assignedUserAvatar: users.avatar,
          created_at: tasks.created_at,
        })
        .from(tasks)
        .leftJoin(users, eq(tasks.assigned_to, users.id))
        .where(
          and(
            eq(tasks.project_id, taskData.project_id),
            sql`${tasks.id} != ${taskId}`,
          ),
        )
        .orderBy(asc(tasks.created_at))
        .limit(10)
    : [];

  // Normalize related tasks (convert null → undefined)
  const relatedTasks = relatedTasksRaw.map((task) => ({
    ...task,
    assignedUserName: task.assignedUserName ?? undefined,
    assignedUserAvatar: task.assignedUserAvatar ?? undefined,
    created_at: task.created_at ?? undefined,
  }));

  // ── Normalize null → undefined ────────────────────────────────────────────
  const normalizedTask = {
    ...taskData,
    description: taskData.description ?? undefined,
    files: taskData.files ?? undefined,
    projectName: taskData.projectName ?? undefined,
    assignedUserName: taskData.assignedUserName ?? undefined,
    assignedByUsername: taskData.assignedByUsername ?? undefined,
    assigned_to: taskData.assigned_to ?? undefined,
    qaAssignedUserName: qaUser?.name ?? undefined,
    qaAssignedUserAvatar: qaUser?.avatar ?? undefined,
    estimated_minutes: taskData.estimated_minutes ?? undefined,
    created_at: taskData.created_at ?? undefined,
    updated_at: taskData.updated_at ?? undefined,
  };

  const userName = currentUser?.name ?? currentUser?.username ?? "User";

  return (
    <TaskDetail
      task={normalizedTask}
      userRole={role}
      userId={userId}
      userName={userName}
      relatedTasks={relatedTasks}
    />
  );
}
