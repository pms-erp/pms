// app/(dashboard)/analytics/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { tasks, projects, users } from "@/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { AnalyticsSectionCards } from "./_components/analytics-section-cards";
import {
  MonthlyTrendChart,
  TeamPerformanceChart,
  StatusDistributionChart,
} from "./_components/analytics-charts";
import {
  AnalyticsUserTable,
  type UserPerformance,
} from "./_components/analytics-user-table";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id: userId, role, team_type } = session.user;

  // ── RBAC task filter ──────────────────────────────────────────────────────
  // Build as a typed SQL fragment or undefined (never null so and() stays clean)
  const taskFilter =
    role === "ADMIN" || role === "PROJECT_MANAGER"
      ? undefined
      : role === "TEAM_LEADER" && team_type
        ? sql`${tasks.assigned_to} IN (
            SELECT id FROM \`users\` WHERE team_type = ${team_type} AND is_active = 1
          )`
        : role === "QA"
          ? eq(tasks.qa_assigned_to, userId)
          : eq(tasks.assigned_to, userId);

  // ── KPI Stats ─────────────────────────────────────────────────────────────
  const [kpi] = await db
    .select({
      total: sql<number>`count(*)`,
      approved: sql<number>`sum(case when ${tasks.status} = 'APPROVED'       then 1 else 0 end)`,
      rework: sql<number>`sum(case when ${tasks.status} = 'REWORK'         then 1 else 0 end)`,
      waitingQA: sql<number>`sum(case when ${tasks.status} = 'WAITING_FOR_QA' then 1 else 0 end)`,
      totalReworkCount: sql<number>`sum(${tasks.rework_count})`,
    })
    .from(tasks)
    .where(taskFilter);

  const total = Number(kpi?.total ?? 0);
  const approved = Number(kpi?.approved ?? 0);
  const rework = Number(kpi?.rework ?? 0);
  const waitingQA = Number(kpi?.waitingQA ?? 0);
  const totalRewC = Number(kpi?.totalReworkCount ?? 0);

  const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const reworkRate = total > 0 ? Math.round((rework / total) * 100) : 0;
  const avgRework = total > 0 ? totalRewC / total : 0;

  // ── Overdue count ─────────────────────────────────────────────────────────
  const overdueCond = sql`${tasks.due_date} IS NOT NULL
    AND ${tasks.due_date} < NOW()
    AND ${tasks.status}   != 'APPROVED'`;

  const overdue = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(taskFilter ? and(taskFilter, overdueCond) : overdueCond)
    .then((r) => Number(r[0]?.count ?? 0));

  // ── Global counters ───────────────────────────────────────────────────────
  const [counts] = await db
    .select({
      totalUsers: sql<number>`(SELECT count(*) FROM \`users\` WHERE is_active = 1)`,
      activeProjects: sql<number>`(SELECT count(*) FROM projects WHERE status = 'ACTIVE')`,
    })
    .from(users)
    .limit(1);

  // ── Status Distribution ───────────────────────────────────────────────────
  const statusData = await db
    .select({
      status: tasks.status,
      count: sql<number>`count(*)`,
    })
    .from(tasks)
    .where(taskFilter)
    .groupBy(tasks.status);

  // ── Monthly Trend (last 12 months) ────────────────────────────────────────
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const monthlyRaw = await db
    .select({
      month: sql<string>`DATE_FORMAT(${tasks.created_at}, '%Y-%m')`,
      created: sql<number>`count(*)`,
      approved: sql<number>`sum(case when ${tasks.status} = 'APPROVED' then 1 else 0 end)`,
      rework: sql<number>`sum(case when ${tasks.rework_count} > 0    then 1 else 0 end)`,
    })
    .from(tasks)
    .where(
      taskFilter
        ? and(taskFilter, gte(tasks.created_at, twelveMonthsAgo))
        : gte(tasks.created_at, twelveMonthsAgo),
    )
    .groupBy(sql`DATE_FORMAT(${tasks.created_at}, '%Y-%m')`)
    .orderBy(sql`DATE_FORMAT(${tasks.created_at}, '%Y-%m')`);

  const monthlyData = monthlyRaw.map((m) => ({
    month: m.month,
    created: Number(m.created),
    approved: Number(m.approved),
    rework: Number(m.rework),
  }));

  // ── Team Performance ──────────────────────────────────────────────────────
  const teamRaw = await db
    .select({
      team: tasks.team_type,
      total: sql<number>`count(*)`,
      approved: sql<number>`sum(case when ${tasks.status} = 'APPROVED' then 1 else 0 end)`,
      rework: sql<number>`sum(case when ${tasks.rework_count} > 0    then 1 else 0 end)`,
    })
    .from(tasks)
    .where(taskFilter)
    .groupBy(tasks.team_type);

  const teamData = teamRaw.map((t) => ({
    team: t.team ?? "UNKNOWN",
    total: Number(t.total),
    approved: Number(t.approved),
    rework: Number(t.rework),
  }));

  // ── User Performance (privileged roles only) ──────────────────────────────
  let userPerformance: UserPerformance[] = [];

  if (
    role === "ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "TEAM_LEADER"
  ) {
    // For TEAM_LEADER: filter by team_type using Drizzle eq (no SQL alias needed)
    const userTeamFilter =
      role === "TEAM_LEADER" && team_type
        ? eq(users.team_type, team_type)
        : undefined;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        role: users.role,
        avatar: users.avatar,
        team_type: users.team_type,
        total: sql<number>`count(${tasks.id})`,
        approved: sql<number>`sum(case when ${tasks.status} = 'APPROVED'       then 1 else 0 end)`,
        rework: sql<number>`sum(case when ${tasks.status} = 'REWORK'         then 1 else 0 end)`,
        inProgress: sql<number>`sum(case when ${tasks.status} = 'IN_PROGRESS'    then 1 else 0 end)`,
        waitingQA: sql<number>`sum(case when ${tasks.status} = 'WAITING_FOR_QA' then 1 else 0 end)`,
        totalRework: sql<number>`sum(${tasks.rework_count})`,
      })
      .from(users)
      .leftJoin(tasks, eq(tasks.assigned_to, users.id))
      .where(
        and(
          eq(users.is_active, true),
          userTeamFilter,
          sql`${users.role} NOT IN ('ADMIN', 'QA')`,
        ),
      )
      .groupBy(
        users.id,
        users.name,
        users.username,
        users.role,
        users.avatar,
        users.team_type,
      )
      .having(sql`count(${tasks.id}) > 0`);

    userPerformance = rows.map((r) => {
      const t = Number(r.total);
      return {
        id: r.id,
        name: r.name,
        username: r.username,
        role: r.role,
        avatar: r.avatar ?? null,
        team_type: r.team_type ?? null,
        total: t,
        approved: Number(r.approved),
        rework: Number(r.rework),
        inProgress: Number(r.inProgress),
        waitingQA: Number(r.waitingQA),
        avgRework: t > 0 ? Number(r.totalRework) / t : 0,
      };
    });
  }

  return (
    <div className="flex flex-col w-full min-w-0">
      <div className="@container/main flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* Page Header */}
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Analytics
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Performance insights ·{" "}
            {role === "ADMIN"
              ? "Organisation-wide view"
              : role === "PROJECT_MANAGER"
                ? "All projects"
                : role === "TEAM_LEADER"
                  ? `Your team · ${team_type ?? ""}`
                  : "Your tasks"}
          </p>
        </div>

        {/* KPI Cards */}
        <AnalyticsSectionCards
          totalTasks={total}
          approvalRate={approvalRate}
          reworkRate={reworkRate}
          avgReworkCount={avgRework}
          waitingQA={waitingQA}
          overdueCount={overdue}
          totalUsers={Number(counts?.totalUsers ?? 0)}
          activeProjects={Number(counts?.activeProjects ?? 0)}
        />

        {/* Charts Row 1: Monthly Trend + Status Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 px-4 lg:px-6">
          <div className="lg:col-span-2">
            <MonthlyTrendChart data={monthlyData} />
          </div>
          <div>
            <StatusDistributionChart
              data={statusData.map((s) => ({
                status: s.status,
                count: Number(s.count),
              }))}
            />
          </div>
        </div>

        {/* Charts Row 2: Team Performance */}
        <div className="px-4 lg:px-6">
          <TeamPerformanceChart data={teamData} />
        </div>

        {/* User Performance Table */}
        {userPerformance.length > 0 && (
          <div className="px-4 lg:px-6">
            <AnalyticsUserTable data={userPerformance} />
          </div>
        )}
      </div>
    </div>
  );
}
