"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconDotsVertical,
  IconClock,
  IconUserCheck,
  IconTrash,
  IconAlertTriangle,
  IconCheck,
  IconCalendar,
} from "@tabler/icons-react";
import { Pagination } from "./pagination";
import Link from "next/link";
import { toast } from "sonner";
import {
  notificationEvents,
  taskEvents,
  Task as TaskEvent,
} from "@/lib/events";
import { TaskSheet } from "./task-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  project_id: string | null;
  projectName: string | null;
  team_type: string | null;
  priority: string | null;
  status: string | null;
  estimated_minutes: number | null;
  assignedUserName: string | null;
  assignedByUsername: string | null;
  assignedUserAvatar: string | null;
  qa_assigned_to: string | null;
  qaAssignedUserName: string | null;
  qaAssignedUserAvatar?: string | null;
  created_at?: string | Date | null; // ✅ Added for created date display
}

interface QAUser {
  id: string;
  name: string;
  username: string;
}

interface TasksTableProps {
  tasks: Task[];
  total: number;
  totalPages: number;
  currentPage: number;
  loading?: boolean;
  params: { status?: string; team?: string; search?: string; page?: string };
  userRole: string;
  userId: string;
  onPageChange: (page: number) => void;
  onTaskUpdated?: (task: Task) => void;
  onTaskDeleted?: (taskId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};
const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: "bg-orange-100 text-orange-700 border-orange-200",
  WAITING_FOR_QA: "bg-purple-100 text-purple-700 border-purple-200",
  APPROVED: "bg-green-100 text-green-700 border-green-200",
  REWORK: "bg-red-100 text-red-700 border-red-200",
};
const TEAM_COLOR: Record<string, string> = {
  DEVELOPER: "bg-blue-100 text-blue-700 border-blue-200",
  DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
};
const gray = "bg-gray-100 text-gray-700 border-gray-200";

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const formatTime = (
  minutes: number | null,
): { time: string; days: string } | null => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const time = minutes < 60 ? `${minutes}m` : m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = (minutes / 480).toFixed(1).replace(/\.0$/, "") + "d";
  return { time, days };
};

// ✅ NEW: Format created date for display
const formatCreatedAt = (date: string | Date | null | undefined): string => {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Show relative time for recent items
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  // Show formatted date for older items
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// ✅ NEW: Format full date/time for tooltip
const formatCreatedAtFull = (
  date: string | Date | null | undefined,
): string => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function TasksTable({
  tasks: initialTasks,
  totalPages,
  currentPage: initialPage,
  userRole,
  userId,
  userName = "",
  onPageChange,
  onTaskDeleted,
}: TasksTableProps & { userName?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Task[]>(initialTasks ?? []);
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage ?? 1);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setData(initialTasks ?? []);
  }, [initialTasks]);
  React.useEffect(() => {
    setCurrentPage(initialPage ?? 1);
  }, [initialPage]);

  const isPrivileged =
    userRole === "ADMIN" ||
    userRole === "PROJECT_MANAGER" ||
    userRole === "TEAM_LEADER";

  // ── Selection ──────────────────────────────────────────────────────────────
  const allSelected = data.length > 0 && data.every((t) => rowSelection[t.id]);
  const someSelected = data.some((t) => rowSelection[t.id]);

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const all: Record<string, boolean> = {};
      data.forEach((t) => (all[t.id] = true));
      setRowSelection(all);
    } else {
      setRowSelection({});
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${taskToDelete}`, {
        method: "DELETE",
      });
      if (!res.ok)
        throw new Error((await res.json()).error ?? "Failed to delete");
      toast.success("Task deleted");
      setData((prev) => prev.filter((t) => t.id !== taskToDelete));
      onTaskDeleted?.(taskToDelete);
      router.refresh();
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApproveTask = async (taskId: string) => {
    setApprovingId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setData((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "APPROVED" } : t)),
      );
      taskEvents.triggerTaskUpdated({
        id: taskId,
        status: "APPROVED",
      } as unknown as TaskEvent);
      toast.success("Task approved");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to approve task",
      );
    } finally {
      setApprovingId(null);
    }
  };

  // ── QA Assign ──────────────────────────────────────────────────────────────
  const [qaDialogOpen, setQaDialogOpen] = useState(false);
  const [taskToAssignQA, setTaskToAssignQA] = useState<string | null>(null);
  const [qaUsers, setQaUsers] = useState<QAUser[]>([]);
  const [selectedQaUser, setSelectedQaUser] = useState("");
  const [assigningQA, setAssigningQA] = useState(false);
  const [loadingQaUsers, setLoadingQaUsers] = useState(false);

  const openQADialog = async (taskId: string) => {
    setTaskToAssignQA(taskId);
    setSelectedQaUser("");
    setQaDialogOpen(true);
    setLoadingQaUsers(true);
    try {
      const res = await fetch("/api/users?role=QA");
      const d = await res.json();
      const list: QAUser[] = Array.isArray(d) ? d : (d.data ?? d.users ?? []);
      setQaUsers(list);
    } catch {
      toast.error("Failed to load QA users");
    } finally {
      setLoadingQaUsers(false);
    }
  };

  const handleAssignQA = async () => {
    if (!taskToAssignQA || !selectedQaUser) return;
    setAssigningQA(true);
    try {
      const res = await fetch(`/api/tasks/${taskToAssignQA}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qa_assigned_to: selectedQaUser,
          qa_assigned_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error("Failed to assign QA");
      const payload = (await res.json()) as { task?: Partial<Task> };

      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [selectedQaUser],
          pushUserIds: [selectedQaUser],
          taskId: taskToAssignQA,
          type: "QA_REVIEWED",
          title: "Task Assigned for QA Review",
          message: "A task has been assigned to you for QA review.",
        }),
      });

      const user = qaUsers.find((u) => u.id === selectedQaUser);
      setData((prev) =>
        prev.map((t) =>
          t.id === taskToAssignQA
            ? {
                ...t,
                qa_assigned_to: selectedQaUser,
                qaAssignedUserName:
                  (payload.task?.qaAssignedUserName as
                    | string
                    | null
                    | undefined) ??
                  user?.name ??
                  t.qaAssignedUserName,
                qaAssignedUserAvatar:
                  (payload.task?.qaAssignedUserAvatar as
                    | string
                    | null
                    | undefined) ?? t.qaAssignedUserAvatar,
              }
            : t,
        ),
      );
      taskEvents.triggerTaskUpdated({
        id: taskToAssignQA,
        qa_assigned_to: selectedQaUser,
        qaAssignedUserName: user?.name ?? null,
      } as unknown as TaskEvent);
      toast.success(`Assigned to ${user?.name ?? "QA"} for review`);
      setQaDialogOpen(false);
      setSelectedQaUser("");
      router.refresh();
    } catch {
      toast.error("Failed to assign QA");
    } finally {
      setAssigningQA(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead className="w-10">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={
                      allSelected || (someSelected ? "indeterminate" : false)
                    }
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </div>
              </TableHead>
              <TableHead className="font-semibold">Task</TableHead>
              <TableHead className="font-semibold">Project</TableHead>
              <TableHead className="font-semibold">Team</TableHead>
              <TableHead className="font-semibold">Priority</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">
                <div className="flex items-center gap-1">
                  <IconUserCheck className="h-4 w-4 text-purple-500" />
                  QA
                </div>
              </TableHead>
              <TableHead className="font-semibold">Assigned To</TableHead>
              <TableHead className="font-semibold">
                <div className="flex items-center gap-1">
                  <IconClock className="h-4 w-4" />
                  Est. Time
                </div>
              </TableHead>
              {/* ✅ NEW: Created Column Header */}
              <TableHead className="font-semibold whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <IconCalendar className="h-4 w-4 text-muted-foreground" />
                  Created
                </div>
              </TableHead>
              <TableHead className="font-semibold w-10" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.length > 0 ? (
              data.map((task) => (
                <TableRow
                  key={task.id}
                  data-state={rowSelection[task.id] ? "selected" : undefined}
                  className={`
                    hover:bg-muted/50 transition-colors
                    ${task.status === "APPROVED" ? "bg-green-200/60 hover:bg-green-100" : ""}
                  `}
                >
                  {/* Checkbox */}
                  <TableCell>
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={!!rowSelection[task.id]}
                        onCheckedChange={(v) =>
                          setRowSelection((prev) => ({
                            ...prev,
                            [task.id]: !!v,
                          }))
                        }
                      />
                    </div>
                  </TableCell>

                  {/* Title */}
                  <TableCell className="font-medium max-w-[220px] truncate">
                    <button
                      type="button"
                      className="hover:underline text-primary text-left truncate max-w-full"
                      onClick={() => setSheetTaskId(task.id)}
                    >
                      {task.title}
                    </button>
                  </TableCell>

                  {/* Project — links to /projects/:id */}
                  <TableCell className="text-sm">
                    {task.project_id && task.projectName ? (
                      <Link
                        href={`/projects/${task.project_id}`}
                        className="hover:underline font-medium transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {task.projectName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        {task.projectName ?? "—"}
                      </span>
                    )}
                  </TableCell>

                  {/* Team */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={TEAM_COLOR[task.team_type ?? ""] ?? gray}
                    >
                      {task.team_type ?? "—"}
                    </Badge>
                  </TableCell>

                  {/* Priority */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={PRIORITY_COLOR[task.priority ?? ""] ?? gray}
                    >
                      {task.priority ?? "—"}
                    </Badge>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLOR[task.status ?? ""] ?? gray}
                    >
                      {task.status?.replace(/_/g, " ") ?? "—"}
                    </Badge>
                  </TableCell>

                  {/* QA Assigned */}
                  <TableCell>
                    {task.qa_assigned_to && task.qaAssignedUserName ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage
                            src={task.qaAssignedUserAvatar ?? undefined}
                          />
                          <AvatarFallback className="bg-purple-600 text-white text-xs">
                            {getInitials(task.qaAssignedUserName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {task.qaAssignedUserName}
                        </span>
                      </div>
                    ) : isPrivileged && task.status === "WAITING_FOR_QA" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-purple-200 text-purple-600 hover:bg-purple-50"
                        onClick={() => openQADialog(task.id)}
                      >
                        <IconUserCheck className="mr-1 h-3.5 w-3.5" />
                        Assign QA
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>

                  {/* Assigned To */}
                  <TableCell>
                    {task.assignedUserName ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage
                            src={task.assignedUserAvatar ?? undefined}
                          />
                          <AvatarFallback className="bg-blue-600 text-white text-xs">
                            {getInitials(task.assignedUserName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">
                          {task.assignedUserName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        Unassigned
                      </span>
                    )}
                  </TableCell>

                  {/* Est. Time */}
                  <TableCell>
                    {(() => {
                      const fmt = formatTime(task.estimated_minutes);
                      if (!fmt)
                        return (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        );
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">
                            {fmt.time}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            ·
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {fmt.days}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>

                  {/* ✅ NEW: Created Date/Time Cell */}
                  <TableCell className="whitespace-nowrap">
                    <div
                      className="text-sm text-muted-foreground cursor-help"
                      title={formatCreatedAtFull(task.created_at)}
                    >
                      {formatCreatedAt(task.created_at)}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <IconDotsVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/tasks/${task.id}`}>View Details</Link>
                        </DropdownMenuItem>

                        {/* Approve */}
                        {isPrivileged && task.status !== "APPROVED" && (
                          <DropdownMenuItem
                            onClick={() => handleApproveTask(task.id)}
                            disabled={approvingId === task.id}
                            className="text-green-600 focus:text-green-600 focus:bg-green-50"
                          >
                            {approvingId === task.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            ) : (
                              <IconCheck className="h-4 w-4" />
                            )}
                            Approve Task
                          </DropdownMenuItem>
                        )}

                        {/* Delete */}
                        {isPrivileged && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setTaskToDelete(task.id);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                              <IconTrash className="mr-2 h-4 w-4" />
                              Delete Task
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                {/* ✅ UPDATED: colSpan increased from 10 to 11 for new column */}
                <TableCell
                  colSpan={11}
                  className="h-24 text-center text-muted-foreground"
                >
                  No tasks found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => {
          setCurrentPage(page);
          onPageChange(page);
        }}
      />

      {/* ── Delete Dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Delete Task</DialogTitle>
            </div>
            <DialogDescription className="pt-4">
              Are you sure? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Deleting...
                </>
              ) : (
                <>
                  <IconTrash className="mr-2 h-4 w-4" />
                  Delete Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Task Sheet ── */}
      <TaskSheet
        taskId={sheetTaskId}
        userRole={userRole}
        userId={userId}
        userName=""
        onClose={() => setSheetTaskId(null)}
        onTaskUpdated={(updated) => {
          setData((prev) =>
            prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
          );
        }}
      />

      {/* ── QA Assign Dialog ── */}
      <Dialog open={qaDialogOpen} onOpenChange={setQaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <IconUserCheck className="h-5 w-5 text-purple-600" />
              </div>
              <DialogTitle>Assign to QA</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Select a QA reviewer for this task.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {loadingQaUsers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                Loading QA users...
              </div>
            ) : (
              <Select value={selectedQaUser} onValueChange={setSelectedQaUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a QA reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {qaUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{" "}
                      <span className="text-muted-foreground">
                        @{u.username}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setQaDialogOpen(false)}
              disabled={assigningQA}
            >
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleAssignQA}
              disabled={assigningQA || !selectedQaUser || loadingQaUsers}
            >
              {assigningQA ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Assigning...
                </>
              ) : (
                <>
                  <IconUserCheck className="mr-2 h-4 w-4" />
                  Assign to QA
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
