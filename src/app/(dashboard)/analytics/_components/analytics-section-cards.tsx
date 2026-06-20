// components/analytics-section-cards.tsx
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AnalyticsSectionCardsProps {
  totalTasks: number;
  approvalRate: number;
  reworkRate: number;
  avgReworkCount: number;
  waitingQA: number;
  overdueCount: number;
  totalUsers: number;
  activeProjects: number;
}

export function AnalyticsSectionCards({
  totalTasks,
  approvalRate,
  reworkRate,
  avgReworkCount,
  waitingQA,
  overdueCount,
  totalUsers,
  activeProjects,
}: AnalyticsSectionCardsProps) {
  const cards = [
    {
      label: "Total Tasks",
      value: totalTasks.toLocaleString(),
      trend: 1,
      footer: `${totalUsers} contributors across ${activeProjects} projects`,
      sub: "All time across all projects",
    },
    {
      label: "Approval Rate",
      value: `${approvalRate}%`,
      trend: approvalRate >= 60 ? 1 : -1,
      footer:
        approvalRate >= 70
          ? "Excellent quality output"
          : approvalRate >= 50
            ? "Room to improve"
            : "Needs attention",
      sub: "Tasks approved on first review",
    },
    {
      label: "Rework Rate",
      value: `${reworkRate}%`,
      trend: reworkRate <= 20 ? 1 : -1,
      footer:
        reworkRate <= 15
          ? "Low rework — great quality"
          : reworkRate <= 30
            ? "Moderate rework rate"
            : "High rework — review process",
      sub: `Avg ${avgReworkCount.toFixed(1)} reworks per task`,
    },
    {
      label: "Overdue Tasks",
      value: overdueCount.toString(),
      trend: overdueCount === 0 ? 1 : -1,
      footer:
        overdueCount === 0
          ? "All tasks on schedule 🎉"
          : `${overdueCount} task${overdueCount > 1 ? "s" : ""} past deadline`,
      sub: `${waitingQA} waiting for QA review`,
    },
  ];

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="@container/card">
          <CardHeader>
            <CardDescription>{c.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {c.value}
            </CardTitle>
            <CardAction>
              <Badge variant="outline">
                {c.trend >= 0 ? (
                  <IconTrendingUp className="size-3.5" />
                ) : (
                  <IconTrendingDown className="size-3.5" />
                )}
                {c.trend >= 0 ? "On track" : "Needs work"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {c.footer}
              {c.trend >= 0 ? (
                <IconTrendingUp className="size-4" />
              ) : (
                <IconTrendingDown className="size-4" />
              )}
            </div>
            <div className="text-muted-foreground">{c.sub}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
