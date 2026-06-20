// app/(dashboard)/analytics/_components/analytics-client.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  IconChartBar,
  IconCheck,
  IconRefresh,
  IconUsers,
  IconFolder,
  IconTrendingUp,
  IconClock,
  IconShieldCheck,
} from "@tabler/icons-react";

interface Props {
  userRole: string;
  statusBreakdown: {
    total: number;
    inProgress: number;
    waitingQA: number;
    approved: number;
    rework: number;
  };
  priorityData: { priority: string; count: number }[];
  teamTypeData: { team_type: string; count: number; approved: number }[];
  monthlyTasks: { month: string; created: number; approved: number }[];
  topPerformers: { name: string; approved: number; total: number }[];
  projectCompletion: { name: string; total: number; completed: number }[];
  reworkRate: number;
  approvalRate: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-yellow-500",
  LOW: "bg-green-500",
};
const TEAM_COLORS: Record<string, string> = {
  DEVELOPER: "bg-blue-500",
  DESIGNER: "bg-pink-500",
  PROGRAMMER: "bg-indigo-500",
};
const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

function fmtMonth(ym: string) {
  const [, m] = ym.split("-");
  return MONTH_LABELS[m] ?? ym;
}

function KPI({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {label}
            </p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center ${color.replace("text-", "bg-").replace("-6", "-1")}`}
          >
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalyticsClient({
  userRole,
  statusBreakdown,
  priorityData,
  teamTypeData,
  monthlyTasks,
  topPerformers,
  projectCompletion,
  reworkRate,
  approvalRate,
}: Props) {
  const isPrivileged = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"].includes(
    userRole,
  );
  const total = statusBreakdown.total || 1; // avoid division by zero

  const maxMonthly = Math.max(...monthlyTasks.map((m) => m.created), 1);
  const maxPerformer = Math.max(...topPerformers.map((p) => p.total), 1);

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full min-w-0">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <IconChartBar className="h-7 w-7 text-blue-500" />
          Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Performance insights for your{" "}
          {userRole === "ADMIN" ? "entire organisation" : "scope"}
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI
          icon={IconChartBar}
          label="Total Tasks"
          value={statusBreakdown.total}
          color="text-blue-600"
          sub="all time"
        />
        <KPI
          icon={IconCheck}
          label="Approval Rate"
          value={`${approvalRate}%`}
          color="text-green-600"
          sub="tasks approved"
        />
        <KPI
          icon={IconRefresh}
          label="Rework Rate"
          value={`${reworkRate}%`}
          color="text-orange-600"
          sub="sent back"
        />
        <KPI
          icon={IconShieldCheck}
          label="Waiting QA"
          value={statusBreakdown.waitingQA}
          color="text-purple-600"
          sub="pending review"
        />
      </div>

      {/* Status Distribution + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Task Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: "In Progress",
                value: statusBreakdown.inProgress,
                color: "bg-orange-500",
                text: "text-orange-600",
              },
              {
                label: "Waiting for QA",
                value: statusBreakdown.waitingQA,
                color: "bg-purple-500",
                text: "text-purple-600",
              },
              {
                label: "Approved",
                value: statusBreakdown.approved,
                color: "bg-green-500",
                text: "text-green-600",
              },
              {
                label: "Rework",
                value: statusBreakdown.rework,
                color: "bg-red-500",
                text: "text-red-600",
              },
            ].map(({ label, value, color, text }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={`text-sm font-semibold ${text}`}>
                    {value}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({Math.round((value / total) * 100)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${Math.round((value / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <IconTrendingUp className="h-4 w-4 text-blue-500" />
              Monthly Task Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyTasks.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No data yet for the last 6 months
              </div>
            ) : (
              <div className="space-y-2">
                {monthlyTasks.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-8 shrink-0">
                      {fmtMonth(m.month)}
                    </span>
                    <div className="flex-1 flex items-center gap-1 h-6">
                      <div
                        className="bg-blue-200 dark:bg-blue-900/40 rounded-sm h-4 transition-all"
                        style={{
                          width: `${Math.round((m.created / maxMonthly) * 100)}%`,
                          minWidth: m.created > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-blue-600 font-medium w-14 text-right">
                        {m.created} created
                      </span>
                      <span className="text-xs text-green-600 font-medium w-14 text-right">
                        {m.approved} approved
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Priority Breakdown + Team Type Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Priority */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tasks by Priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {priorityData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No data
              </p>
            ) : (
              priorityData.map(({ priority, count }) => (
                <div key={priority} className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full shrink-0 ${PRIORITY_COLORS[priority] ?? "bg-gray-400"}`}
                  />
                  <span className="text-sm flex-1 capitalize font-medium">
                    {priority.toLowerCase()}
                  </span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PRIORITY_COLORS[priority] ?? "bg-gray-400"}`}
                      style={{ width: `${Math.round((count / total) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right">
                    {count}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Team Type */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tasks by Team</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {teamTypeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No data
              </p>
            ) : (
              teamTypeData.map(({ team_type, count, approved }) => {
                const rate =
                  count > 0 ? Math.round((approved / count) * 100) : 0;
                return (
                  <div key={team_type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${TEAM_COLORS[team_type] ?? "bg-gray-400"}`}
                        />
                        <span className="text-sm font-medium capitalize">
                          {team_type.toLowerCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {count} tasks
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs h-5 bg-green-50 text-green-700 border-green-200"
                        >
                          {rate}% approved
                        </Badge>
                      </div>
                    </div>
                    <Progress value={rate} className="h-1.5" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Performers (privileged only) */}
      {isPrivileged && topPerformers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <IconUsers className="h-4 w-4 text-indigo-500" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topPerformers.map((p, i) => {
                const rate =
                  p.total > 0 ? Math.round((p.approved / p.total) * 100) : 0;
                return (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/40"
                  >
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                        i === 0
                          ? "bg-yellow-500"
                          : i === 1
                            ? "bg-slate-400"
                            : i === 2
                              ? "bg-amber-600"
                              : "bg-muted-foreground"
                      }`}
                    >
                      {i < 3 ? ["🥇", "🥈", "🥉"][i] : p.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Progress value={rate} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground shrink-0">
                          {p.approved}/{p.total}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Completion (ADMIN / PM only) */}
      {["ADMIN", "PROJECT_MANAGER"].includes(userRole) &&
        projectCompletion.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <IconFolder className="h-4 w-4 text-green-500" />
                Project Completion Rates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectCompletion.map((p) => {
                const rate =
                  p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
                return (
                  <div key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate max-w-[60%]">
                        {p.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {p.completed}/{p.total} tasks
                        </span>
                        <span
                          className={`text-xs font-semibold ${rate >= 80 ? "text-green-600" : rate >= 50 ? "text-amber-600" : "text-red-600"}`}
                        >
                          {rate}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${rate >= 80 ? "bg-green-500" : rate >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
