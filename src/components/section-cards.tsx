// components/section-cards.tsx
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

interface SectionCardsProps {
  totalTasks: number;
  completionRate: number;
  activeProjects: number;
  overdueCount: number;
  waitingQA: number;
  reworkCount: number;
  totalUsers?: number;
  userRole: string;
  // trends vs last month (positive = up)
  taskTrend?: number;
  projectTrend?: number;
}

export function SectionCards({
  totalTasks,
  completionRate,
  activeProjects,
  overdueCount,
  waitingQA,
  reworkCount,
  totalUsers,
  userRole,
  taskTrend = 0,
  projectTrend = 0,
}: SectionCardsProps) {
  const isAdmin = userRole === "ADMIN";
  const isPM = userRole === "PROJECT_MANAGER";

  const cards = [
    {
      label: "Total Tasks",
      value: totalTasks.toString(),
      trend: taskTrend,
      footer:
        taskTrend >= 0
          ? `+${taskTrend} new this month`
          : `${taskTrend} fewer this month`,
      sub: "Across all projects",
    },
    {
      label: "Completion Rate",
      value: `${completionRate}%`,
      trend: completionRate >= 50 ? 1 : -1,
      footer:
        completionRate >= 70
          ? "Excellent progress"
          : completionRate >= 50
            ? "Good progress"
            : "Needs attention",
      sub: "Approved / total tasks",
    },
    ...(isAdmin || isPM
      ? [
          {
            label: "Active Projects",
            value: activeProjects.toString(),
            trend: projectTrend,
            footer:
              projectTrend >= 0
                ? `${projectTrend} launched this month`
                : `${Math.abs(projectTrend)} completed`,
            sub: "Currently in progress",
          },
        ]
      : [
          {
            label: "Waiting QA",
            value: waitingQA.toString(),
            trend: waitingQA > 3 ? -1 : 1,
            footer:
              waitingQA > 0
                ? `${waitingQA} task${waitingQA > 1 ? "s" : ""} pending review`
                : "Queue is clear",
            sub: "Ready for QA review",
          },
        ]),
    ...(isAdmin
      ? [
          {
            label: "Team Members",
            value: (totalUsers ?? 0).toString(),
            trend: 1,
            footer: "Active in the system",
            sub: "All roles combined",
          },
        ]
      : [
          {
            label: "Rework Tasks",
            value: reworkCount.toString(),
            trend: reworkCount > 0 ? -1 : 1,
            footer:
              reworkCount > 0
                ? `${reworkCount} task${reworkCount > 1 ? "s" : ""} sent back`
                : "No rework — great!",
            sub: "Need to be fixed",
          },
        ]),
  ];

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {cards.map((card) => (
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
                {card.trend >= 0 ? "Trending up" : "Trending down"}
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
  );
}
