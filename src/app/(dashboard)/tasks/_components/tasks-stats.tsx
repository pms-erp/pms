"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  IconClipboard,
  IconClock,
  IconHourglass,
  IconCheck,
  IconRefresh,
  IconEye,
} from "@tabler/icons-react";
import { TaskStats } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

interface TasksStatsProps {
  stats: TaskStats;
  currentStatus?: string | null;
  onStatusClick?: (status: string | null) => void;
  userRole?: string;
}

export function TasksStats({
  stats,
  currentStatus,
  onStatusClick,
  userRole,
}: TasksStatsProps) {
  const statusFilters = [
    {
      label: "Total Tasks",
      value: null,
      count: stats.total, // ✅ Shows ALL tasks for QA now
      icon: IconClipboard,
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
      borderColor: "border-blue-200",
      hidden: false,
    },
    {
      label: "In Progress",
      value: "IN_PROGRESS",
      count: stats.inProgress, // ✅ Shows ALL in-progress tasks for QA now
      icon: IconClock,
      bgColor: "bg-orange-100",
      iconColor: "text-orange-600",
      borderColor: "border-orange-200",
      hidden: false,
    },
    {
      label: "Waiting for QA",
      value: "WAITING_FOR_QA",
      // ✅ QA sees only their assigned WFQ tasks; others see all WFQ tasks
      count: stats.waitingForQa,
      icon: IconHourglass,
      bgColor: "bg-purple-100",
      iconColor: "text-purple-600",
      borderColor: "border-purple-200",
      hidden: false, // ✅ Always show for QA now
    },
    {
      label: "Approved",
      value: "APPROVED",
      count: stats.approved,
      icon: IconCheck,
      bgColor: "bg-green-100",
      iconColor: "text-green-600",
      borderColor: "border-green-200",
      hidden: false,
    },
    {
      label: "Rework",
      value: "REWORK",
      count: stats.rework || 0,
      icon: IconRefresh,
      bgColor: "bg-red-100",
      iconColor: "text-red-600",
      borderColor: "border-red-200",
      hidden: false,
    },
    {
      label: "Project Viewer",
      value: "PROJECT_VIEWER",
      count: stats.projectViewerTasks,
      icon: IconEye,
      bgColor: "bg-teal-100",
      iconColor: "text-teal-600",
      borderColor: "border-teal-200",
      hidden: stats.projectViewerTasks === 0,
    },
  ].filter((f) => !f.hidden);

  return (
    <div
      className={cn(
        "grid gap-4",
        statusFilters.length <= 4
          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : statusFilters.length === 5
            ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6",
      )}
    >
      {statusFilters.map((filter) => {
        const Icon = filter.icon;
        const isActive =
          filter.value !== null && filter.value === currentStatus;

        return (
          <Card
            key={filter.label}
            className={cn(
              "cursor-pointer transition-all duration-200 hover:shadow-md",
              isActive
                ? `ring-2 ${filter.borderColor} shadow-md`
                : "hover:scale-105",
            )}
            onClick={() => onStatusClick?.(filter.value)}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={cn("p-3 rounded-lg", filter.bgColor)}>
                  <Icon className={cn("h-6 w-6", filter.iconColor)} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    {filter.label}
                  </p>
                  <p className="text-2xl font-bold">{filter.count}</p>
                </div>
                {isActive && (
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full",
                      filter.iconColor.replace("text-", "bg-"),
                    )}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
