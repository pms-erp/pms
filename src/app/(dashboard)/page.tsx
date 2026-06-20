// app/(dashboard)/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { tasks, projects, users } from "@/db/schema";
import { eq, sql, and, desc, gte, or } from "drizzle-orm";
import { SectionCards } from "@/components/section-cards";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DashboardDataTable } from "@/components/dashboard-data-table";
import { getTaskStats } from "@/lib/tasks/service";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id: userId, role, team_type } = session.user;

  // ── RBAC task filter ──────────────────────────────────────────────────────
  // Must match the logic in lib/tasks/service.ts exactly so stats are consistent.
  const viewerCondition = sql`${tasks.id} IN (
    SELECT tv.task_id FROM task_viewers tv WHERE tv.user_id = ${userId}
  )`;

  const taskFilter =
    role === "ADMIN" || role === "PROJECT_MANAGER"
      ? undefined
      : role === "TEAM_LEADER" && team_type
        ? or(
            sql`${tasks.assigned_to} IN (
              SELECT id FROM \`users\` WHERE team_type = ${team_type} AND is_active = 1
            )`,
            viewerCondition,
          )
        : role === "QA"
          ? or(eq(tasks.qa_assigned_to, userId), viewerCondition)
          : or(
              eq(tasks.assigned_to, userId),
              eq(tasks.assigned_by, userId),
              viewerCondition,
            );

  // ── Task stats — use the shared service so numbers always match ───────────
  const statsResult = await getTaskStats(userId, role, team_type ?? null);

  const total = statsResult.total;
  const approved = statsResult.approved;
  const waitingQA = statsResult.waitingForQa;
  const rework = statsResult.rework;
  const completion = total > 0 ? Math.round((approved / total) * 100) : 0;

  // ── Overdue count ─────────────────────────────────────────────────────────
  const overdueCond = sql`${tasks.due_date} IS NOT NULL
    AND ${tasks.due_date} < NOW()
    AND ${tasks.status}   != 'APPROVED'`;

  const overdue = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(taskFilter ? and(taskFilter, overdueCond) : overdueCond)
    .then((r) => Number(r[0]?.count ?? 0));

  // ── Active projects count ─────────────────────────────────────────────────
  const [activeProj] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.status, "ACTIVE"));

  // ── Team member count ─────────────────────────────────────────────────────
  const [userCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.is_active, true));

  // ── Task trend vs last month ──────────────────────────────────────────────
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [thisMonth] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(
      taskFilter
        ? and(taskFilter, gte(tasks.created_at, thirtyDaysAgo))
        : gte(tasks.created_at, thirtyDaysAgo),
    );

  const [lastMonth] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(
      taskFilter
        ? and(
            taskFilter,
            sql`${tasks.created_at} >= ${sixtyDaysAgo.toISOString()}
              AND ${tasks.created_at} < ${thirtyDaysAgo.toISOString()}`,
          )
        : sql`${tasks.created_at} >= ${sixtyDaysAgo.toISOString()}
            AND ${tasks.created_at} < ${thirtyDaysAgo.toISOString()}`,
    );

  const taskTrend =
    Number(thisMonth?.count ?? 0) - Number(lastMonth?.count ?? 0);

  // ── Daily chart data (last 90 days) ───────────────────────────────────────
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const dailyRaw = await db
    .select({
      date: sql<string>`DATE(${tasks.created_at})`,
      created: sql<number>`count(*)`,
      approved: sql<number>`sum(case when ${tasks.status} = 'APPROVED' then 1 else 0 end)`,
    })
    .from(tasks)
    .where(
      taskFilter
        ? and(taskFilter, gte(tasks.created_at, ninetyDaysAgo))
        : gte(tasks.created_at, ninetyDaysAgo),
    )
    .groupBy(sql`DATE(${tasks.created_at})`)
    .orderBy(sql`DATE(${tasks.created_at})`);

  // Fill missing days with zeros so chart looks continuous
  const dateMap = new Map(dailyRaw.map((d) => [d.date, d]));
  const chartData: { date: string; created: number; approved: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const row = dateMap.get(key);
    chartData.push({
      date: key,
      created: Number(row?.created ?? 0),
      approved: Number(row?.approved ?? 0),
    });
  }

  // ── Recent tasks (last 20) ────────────────────────────────────────────────
  const recentRows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      team_type: tasks.team_type,
      due_date: tasks.due_date,
      estimated_minutes: tasks.estimated_minutes,
      projectName: projects.name,
      assignedToName: users.name,
      assignedUserAvatar: users.avatar,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .leftJoin(users, eq(tasks.assigned_to, users.id))
    .where(taskFilter)
    .orderBy(desc(tasks.created_at))
    .limit(20);

  const tableData = recentRows.map((r) => ({
    id: r.id,
    title: r.title,
    projectName: r.projectName ?? null,
    team_type: r.team_type ?? null,
    priority: r.priority ?? null,
    status: r.status,
    assignedToName: r.assignedToName ?? null,
    estimated_minutes: r.estimated_minutes ?? null,
    assignedUserAvatar: r.assignedUserAvatar ?? null,
  }));

  return (
    <div className="flex flex-col w-full min-w-0">
      <div className="@container/main flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* ── Section Cards ── */}
        <SectionCards
          userRole={role}
          totalTasks={total}
          completionRate={completion}
          activeProjects={Number(activeProj?.count ?? 0)}
          overdueCount={overdue}
          waitingQA={waitingQA}
          reworkCount={rework}
          totalUsers={Number(userCount?.count ?? 0)}
          taskTrend={taskTrend}
          projectTrend={0}
        />

        {/* ── Area Chart ── */}
        <div className="px-4 lg:px-6">
          <ChartAreaInteractive data={chartData} />
        </div>

        {/* ── Recent Tasks DataTable ── */}
        <DashboardDataTable
          data={tableData}
          userRole={role}
          userId={userId}
          userName={session.user.name}
        />
      </div>
    </div>
  );
}
