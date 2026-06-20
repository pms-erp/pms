"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
  ExternalLink,
  FolderOpen,
  TrendingUp,
  Activity,
  Globe,
} from "lucide-react";
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";

type ClientProject = {
  id: string;
  name: string;
  client_name: string | null;
  website_url: string | null;
  status: string;
  body: string | null;
  created_at: string;
  total_tasks: number;
  approved_tasks: number;
  completion_percent: number;
};

type DailyPoint = {
  date: string;
  created: number;
  approved: number;
};

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  PLANNING: {
    label: "Planning",
    dot: "bg-gray-400",
    badge: "bg-gray-50 text-gray-600 border-gray-200",
  },
  ACTIVE: {
    label: "Active",
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
  },
  IN_QA: {
    label: "In QA",
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
  },
  ON_HOLD: {
    label: "On Hold",
    dot: "bg-amber-400",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  COMPLETED: {
    label: "Completed",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  CANCELLED: {
    label: "Cancelled",
    dot: "bg-red-400",
    badge: "bg-red-50 text-red-700 border-red-200",
  },
};

export default function ClientDashboardPage() {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [chartData, setChartData] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/client/projects").then((r) => r.json()),
      fetch("/api/client/task-activity").then((r) => r.json()),
    ])
      .then(([projectsRes, activityRes]) => {
        setProjects(projectsRes.data ?? []);
        setChartData(activityRes.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading your projects…
          </p>
        </div>
      </div>
    );
  }

  const totalTasks = projects.reduce((s, p) => s + Number(p.total_tasks), 0);
  const totalDone = projects.reduce((s, p) => s + Number(p.approved_tasks), 0);
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;
  const completedCount = projects.filter(
    (p) => p.status === "COMPLETED",
  ).length;
  const overallPercent =
    totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  const statCards = [
    {
      label: "Total Projects",
      value: projects.length.toString(),
      trend: 1,
      footer: `${completedCount} completed`,
      sub: "All assigned projects",
    },
    {
      label: "Active Projects",
      value: activeCount.toString(),
      trend: activeCount > 0 ? 1 : 0,
      footer: activeCount > 0 ? "Currently in progress" : "None active",
      sub: "Work underway",
    },
    {
      label: "Tasks Completed",
      value: `${totalDone}/${totalTasks}`,
      trend: overallPercent >= 50 ? 1 : -1,
      footer:
        overallPercent >= 70
          ? "Excellent progress"
          : overallPercent >= 50
            ? "Good progress"
            : "In progress",
      sub: "Approved / total tasks",
    },
    {
      label: "Overall Progress",
      value: `${overallPercent}%`,
      trend: overallPercent >= 50 ? 1 : -1,
      footer:
        overallPercent === 100
          ? "All done! 🎉"
          : `${100 - overallPercent}% remaining`,
      sub: "Across all projects",
    },
  ];

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* ── Stat cards — same pattern as SectionCards ──────────────────── */}
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-4 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="@container/card">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {card.value}
              </CardTitle>
              <CardAction>
                <Badge variant="outline">
                  {card.trend >= 0 ? (
                    <IconTrendingUp className="size-3.5" />
                  ) : (
                    <IconTrendingDown className="size-3.5" />
                  )}
                  {card.trend >= 0 ? "Trending up" : "Needs attention"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {card.footer}
                {card.trend >= 0 ? (
                  <IconTrendingUp className="size-4" />
                ) : (
                  <IconTrendingDown className="size-4" />
                )}
              </div>
              <div className="text-muted-foreground">{card.sub}</div>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* ── Chart Section ────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive data={chartData} />
      </div>

      {/* ── Projects grid ────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Your Projects</h2>
          <span className="text-xs text-muted-foreground">
            {projects.length} total
          </span>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <FolderOpen className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                No projects yet
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Your project manager will link your projects here once work
                begins.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => {
              const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.PLANNING;
              return (
                <Link key={p.id} href={`/client/${p.id}`}>
                  <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer group h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <FolderOpen className="h-4.5 w-4.5 h-[18px] w-[18px] text-primary" />
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-[15px] truncate group-hover:text-primary transition-colors">
                              {p.name}
                            </CardTitle>
                            {p.client_name && (
                              <CardDescription className="truncate">
                                {p.client_name}
                              </CardDescription>
                            )}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.badge}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                          />
                          {cfg.label}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {p.approved_tasks} of {p.total_tasks} tasks complete
                        </span>
                        <span
                          className={`text-xs font-bold ${p.completion_percent === 100 ? "text-emerald-600" : ""}`}
                        >
                          {p.completion_percent}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${p.completion_percent === 100 ? "bg-emerald-500" : "bg-primary"}`}
                          style={{ width: `${p.completion_percent}%` }}
                        />
                      </div>
                    </CardContent>

                    <CardFooter className="pt-3 border-t flex items-center justify-between">
                      {p.website_url ? (
                        <Link
                          href={p.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Website
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(p.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1 group-hover:text-primary transition-colors font-medium">
                        View details
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </CardFooter>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
