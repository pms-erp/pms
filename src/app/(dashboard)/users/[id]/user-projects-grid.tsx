// app/(dashboard)/users/[id]/user-projects-grid.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Project {
  id: string;
  name: string;
  status: string;
  task_count: number;
}

const PROJECT_STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  PLANNING: {
    label: "Planning",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  ACTIVE: {
    label: "Active",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  IN_QA: {
    label: "In QA",
    className: "bg-purple-100 text-purple-700 border-purple-200",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

export function UserProjectsGrid({ projects }: { projects: Project[] }) {
  const [visibleCount, setVisibleCount] = useState(6);
  const visibleProjects = projects.slice(0, visibleCount);
  const hasMore = visibleCount < projects.length;

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No projects assigned yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleProjects.map((project) => {
          const pStatus = PROJECT_STATUS_STYLES[project.status] ?? {
            label: project.status,
            className: "bg-gray-100 text-gray-700 border-gray-200",
          };
          return (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <p className="font-semibold text-sm leading-tight">
                      {project.name}
                    </p>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-xs ${pStatus.className}`}
                    >
                      {pStatus.label}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {project.task_count} task
                    {project.task_count !== 1 ? "s" : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="flex justify-center mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((prev) => prev + 6)}
            className="min-w-[140px]"
          >
            Load More ({projects.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </>
  );
}
