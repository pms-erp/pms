// src/app/(client-portal)/client/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NextLink from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Loader2,
  FolderOpen,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProjectChatPanel } from "@/app/(dashboard)/projects/[id]/_components/project-chat-panel";

// ── Types ────────────────────────────────────────────────────────────────────
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  team_type: string;
  assignedUserName: string | null;
  assignedUserAvatar: string | null;
  estimated_minutes: number | null;
  created_at: string | Date | null;
};

type Project = {
  id: string;
  name: string;
  client_name?: string | null;
  status: string;
};

type ProjectStats = {
  total: number;
  approved: number;
  in_progress: number;
  waiting_qa: number;
  rework: number;
  completion_percent: number;
};

type ProjectData = {
  project: Project;
  tasks: Task[];
  stats: ProjectStats;
};

// ── Stats Cards Component ────────────────────────────────────────────────────
function ProjectStatsCards({
  stats,
  onStatusClick,
  currentStatus,
}: {
  stats: ProjectStats;
  onStatusClick: (status: string | null) => void;
  currentStatus: string | null;
}) {
  const statusFilters = [
    {
      label: "Total Tasks",
      value: null,
      count: stats.total,
      icon: FolderOpen,
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600",
      borderColor: "border-blue-200",
    },
    {
      label: "In Progress",
      value: "IN_PROGRESS",
      count: stats.in_progress,
      icon: Clock,
      bgColor: "bg-orange-100",
      iconColor: "text-orange-600",
      borderColor: "border-orange-200",
    },
    {
      label: "In Review",
      value: "WAITING_FOR_QA",
      count: stats.waiting_qa,
      icon: AlertCircle,
      bgColor: "bg-purple-100",
      iconColor: "text-purple-600",
      borderColor: "border-purple-200",
    },
    {
      label: "Approved",
      value: "APPROVED",
      count: stats.approved,
      icon: CheckCircle2,
      bgColor: "bg-green-100",
      iconColor: "text-green-600",
      borderColor: "border-green-200",
    },
    {
      label: "Rework",
      value: "REWORK",
      count: stats.rework,
      icon: RotateCcw,
      bgColor: "bg-red-100",
      iconColor: "text-red-600",
      borderColor: "border-red-200",
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
      {statusFilters.map((filter) => {
        const Icon = filter.icon;
        const isActive = filter.value === currentStatus;

        return (
          <Card
            key={filter.label}
            className={cn(
              "cursor-pointer transition-all duration-200 hover:shadow-md",
              isActive
                ? `ring-2 ${filter.borderColor} shadow-md`
                : "hover:scale-105",
            )}
            onClick={() => onStatusClick(filter.value)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg shrink-0", filter.bgColor)}>
                  <Icon className={cn("h-4 w-4", filter.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">
                    {filter.label}
                  </p>
                  <p className="text-xl font-bold">{filter.count}</p>
                </div>
                {isActive && (
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full shrink-0",
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  WAITING_FOR_QA: {
    label: "In Review",
    color: "text-violet-600 bg-violet-50 border-violet-200",
  },
  APPROVED: {
    label: "Complete",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  REWORK: {
    label: "Needs Work",
    color: "text-red-600 bg-red-50 border-red-200",
  },
};

const PRIORITY_CONFIG = {
  LOW: { label: "Low", color: "text-green-600 bg-green-50 border-green-200" },
  MEDIUM: {
    label: "Medium",
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  HIGH: { label: "High", color: "text-red-600 bg-red-50 border-red-200" },
};

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/client/projects/${projectId}`);
        if (!res.ok) throw new Error("Failed to load project");
        const data: ProjectData = await res.json();
        setProject(data.project);
        setTasks(data.tasks || []);
        setStats(data.stats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    if (projectId) fetchData();
  }, [projectId]);

  // Filter tasks
  useEffect(() => {
    let filtered = [...tasks];
    if (currentStatus) {
      filtered = filtered.filter((t) => t.status === currentStatus);
    }
    if (priorityFilter !== "all") {
      filtered = filtered.filter((t) => t.priority === priorityFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.assignedUserName?.toLowerCase().includes(q) ?? false),
      );
    }
    setFilteredTasks(filtered);
  }, [tasks, currentStatus, priorityFilter, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-black" />
      </div>
    );
  }

  if (!project || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <h2 className="text-xl font-semibold">Project Not Found</h2>
          <NextLink href="/client">
            <Button variant="outline">← Back to Projects</Button>
          </NextLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <NextLink href="/client">
            <ArrowLeft className="h-5 w-5" />
          </NextLink>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.client_name && (
            <p className="text-muted-foreground mt-1">{project.client_name}</p>
          )}
        </div>
        <Badge variant="outline" className="mt-1">
          {project.status}
        </Badge>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">
              Overall Progress
            </p>
            <p className="text-sm font-bold">{stats.completion_percent}%</p>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                stats.completion_percent === 100
                  ? "bg-emerald-500"
                  : "bg-blue-500",
              )}
              style={{ width: `${stats.completion_percent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {stats.approved} of {stats.total} tasks completed
          </p>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <ProjectStatsCards
        stats={stats}
        currentStatus={currentStatus}
        onStatusClick={setCurrentStatus}
      />

      {/* Main content — tasks left, chat right */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
        {/* Left: Filters + Tasks Table */}
        <div className="space-y-4 min-w-0">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 max-w-sm">
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>

            {(currentStatus || priorityFilter !== "all" || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCurrentStatus(null);
                  setPriorityFilter("all");
                  setSearchQuery("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          {/* Tasks Table */}
          <Card>
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">
                Tasks ({filteredTasks.length})
              </h2>
            </div>
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="font-semibold">Task</TableHead>
                  <TableHead className="font-semibold">Team</TableHead>
                  <TableHead className="font-semibold">Priority</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Assigned To</TableHead>
                  <TableHead className="font-semibold">Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((task) => {
                    const statusCfg =
                      STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG];
                    const priorityCfg =
                      PRIORITY_CONFIG[
                        task.priority as keyof typeof PRIORITY_CONFIG
                      ];

                    return (
                      <TableRow
                        key={task.id}
                        className={cn(
                          "hover:bg-muted/50 transition-colors",
                          task.status === "APPROVED" && "bg-green-50/50",
                        )}
                      >
                        <TableCell className="font-medium max-w-[220px] truncate">
                          <NextLink
                            href={`/client/tasks/${task.id}`}
                            className="hover:underline text-primary"
                          >
                            {task.title}
                          </NextLink>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {task.team_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", priorityCfg?.color)}
                          >
                            {priorityCfg?.label || task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", statusCfg?.color)}
                          >
                            {statusCfg?.label || task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.assignedUserName ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs shrink-0">
                                {task.assignedUserName.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm truncate">
                                {task.assignedUserName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              Unassigned
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(task.created_at)}
                        </TableCell>
                        <TableCell>
                          <NextLink href={`/client/tasks/${task.id}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </NextLink>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No tasks found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

        {/* Right: Chat Panel — sticky so it stays in view while scrolling tasks */}
        <div className="xl:sticky xl:top-6 h-[600px]">
          <ProjectChatPanel projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
