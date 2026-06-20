// app/client/projects/page.tsx
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
  Search,
  Filter,
  Calendar,
  Users,
  MoreVertical,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

export default function ClientProjectsPage() {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/client/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        </div>
      </div>
    );
  }

  // Filter projects
  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.client_name &&
        p.client_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = projects.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex flex-col gap-6 py-6">
      {/* Header */}
      <div className="px-4 lg:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Your Projects</h1>
        <p className="text-muted-foreground">
          View and track all your assigned projects
        </p>
      </div>

      {/* Filters */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">
                    All Status ({projects.length})
                  </SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${config.dot}`}
                        />
                        {config.label} ({statusCounts[key] || 0})
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <div className="px-4 lg:px-6">
        {filteredProjects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <FolderOpen className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                {projects.length === 0
                  ? "No projects yet"
                  : "No matching projects"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {projects.length === 0
                  ? "Your project manager will link your projects here once work begins."
                  : "Try adjusting your search or filter criteria."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Projects</CardTitle>
                  <CardDescription>
                    {filteredProjects.length} of {projects.length} projects
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Progress
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Tasks
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Created
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((p) => {
                    const cfg =
                      STATUS_CONFIG[p.status] ?? STATUS_CONFIG.PLANNING;
                    return (
                      <TableRow key={p.id} className="group">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                              <FolderOpen className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <Link
                                href={`/client/${p.id}`}
                                className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                              >
                                {p.name}
                              </Link>
                              {p.client_name && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {p.client_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.badge}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}
                            />
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  p.completion_percent === 100
                                    ? "bg-emerald-500"
                                    : "bg-primary"
                                }`}
                                style={{ width: `${p.completion_percent}%` }}
                              />
                            </div>
                            <span
                              className={`text-xs font-bold ${
                                p.completion_percent === 100
                                  ? "text-emerald-600"
                                  : ""
                              }`}
                            >
                              {p.completion_percent}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {p.approved_tasks}/{p.total_tasks}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(p.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              },
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {p.website_url && (
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <Link
                                  href={p.website_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  <span className="sr-only">Visit website</span>
                                </Link>
                              </Button>
                            )}
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3"
                            >
                              <Link href={`/client/${p.id}`}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
