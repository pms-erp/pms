// components/project-tasks-table.tsx
"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  IconChevronDown,
  IconClock,
  IconTrash,
  IconAlertTriangle,
} from "@tabler/icons-react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TaskSheet,
  SheetTaskData,
} from "../../../tasks/_components/task-sheet";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectTask {
  id: string;
  title: string;
  team_type: string;
  status: string;
  priority: string;
  assigned_to: string;
  assignedUserName: string | null;
  assignedUserAvatar: string | null;
  assignedByUsername: string | null;
  estimated_minutes: number | null;
  created_at: string | Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-orange-100 text-orange-700 border-orange-200",
  WAITING_FOR_QA: "bg-purple-100 text-purple-700 border-purple-200",
  APPROVED: "bg-green-100 text-green-700 border-green-200",
  REWORK: "bg-red-100 text-red-700 border-red-200",
};
const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In Progress",
  WAITING_FOR_QA: "Waiting for QA",
  APPROVED: "Approved",
  REWORK: "Rework",
};
const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};
const TEAM_COLORS: Record<string, string> = {
  DEVELOPER: "bg-blue-100 text-blue-700 border-blue-200",
  DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function formatTime(
  minutes: number | null,
): { time: string; days: string } | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const time =
    minutes < 60 ? `${minutes} min` : m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = (minutes / 480).toFixed(1).replace(/\.0$/, "") + "d";
  return { time, days };
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id });
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-7 hover:bg-transparent"
    >
      <IconGripVertical className="text-muted-foreground size-3" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  );
}

// ── Columns ───────────────────────────────────────────────────────────────────

const columns: ColumnDef<ProjectTask>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
  },
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: "Task",
    enableHiding: false,
    cell: ({ row }) => (
      <span className="font-medium text-primary hover:underline cursor-pointer line-clamp-1 max-w-[220px] block">
        {row.original.title}
      </span>
    ),
  },
  {
    accessorKey: "team_type",
    header: "Team",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-xs font-medium ${TEAM_COLORS[row.original.team_type] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
      >
        {row.original.team_type}
      </Badge>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-xs font-medium ${STATUS_COLORS[row.original.status] ?? ""}`}
      >
        {STATUS_LABELS[row.original.status] ??
          row.original.status.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-xs font-medium ${PRIORITY_COLORS[row.original.priority] ?? ""}`}
      >
        {row.original.priority}
      </Badge>
    ),
  },
  {
    accessorKey: "assignedUserName",
    header: "Assigned To",
    cell: ({ row }) => {
      const { assignedUserName, assignedUserAvatar, assignedByUsername } =
        row.original;
      return assignedUserName ? (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={assignedUserAvatar ?? undefined} />
            <AvatarFallback className="text-[10px] bg-blue-600 text-white">
              {getInitials(assignedUserName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none truncate">
              {assignedUserName}
            </p>
            {assignedByUsername && (
              <p className="text-xs text-muted-foreground mt-0.5">
                @{assignedByUsername}
              </p>
            )}
          </div>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Unassigned</span>
      );
    },
  },
  {
    accessorKey: "estimated_minutes",
    header: () => (
      <div className="flex items-center gap-1">
        <IconClock className="h-4 w-4" />
        Est. Time
      </div>
    ),
    cell: ({ row }) => {
      const fmt = formatTime(row.original.estimated_minutes);
      if (!fmt) return <span className="text-sm text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{fmt.time}</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-xs text-muted-foreground">{fmt.days}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => {
      const date = row.original.created_at;
      if (!date)
        return <span className="text-sm text-muted-foreground">—</span>;
      const d = typeof date === "string" ? new Date(date) : date;
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let relative: string;
      if (diffMins < 1) relative = "Just now";
      else if (diffMins < 60) relative = `${diffMins}m ago`;
      else if (diffHours < 24) relative = `${diffHours}h ago`;
      else if (diffDays < 7) relative = `${diffDays}d ago`;
      else
        relative = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{relative}</span>
          <span className="text-[11px] text-muted-foreground">
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
            size="icon"
          >
            <IconDotsVertical />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem asChild>
            <Link href={`/tasks/${row.original.id}`}>View Details</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

// ── Draggable Row with Sheet Integration ──────────────────────────────────────

interface DraggableRowProps {
  row: Row<ProjectTask>;
  onTaskClick: (taskId: string) => void;
  onApprove: (taskId: string) => void;
  approvingId: string | null;
  onDelete: (taskId: string) => void;
  deletingId: string | null;
  isPrivileged: boolean;
}

function DraggableRow({
  row,
  onTaskClick,
  onApprove,
  approvingId,
  onDelete,
  deletingId,
  isPrivileged,
}: DraggableRowProps) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  });

  // Asana-style: subtle green background for approved tasks
  const isApproved = row.original.status === "APPROVED";

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className={`
        relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 
        hover:bg-muted/50 transition-colors
        ${isApproved ? "bg-green-200/60 hover:bg-green-100" : ""}
      `}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {row.getVisibleCells().map((cell) => {
        // ── Title cell — open sheet on click ──────────────────────────────────
        if (cell.column.id === "title") {
          return (
            <TableCell
              key={cell.id}
              className={`font-medium max-w-[220px] truncate ${isApproved ? "line-through text-muted-foreground" : ""}`}
            >
              <button
                type="button"
                className={`hover:underline text-left truncate max-w-full w-full ${isApproved ? "text-muted-foreground" : "text-primary"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskClick(row.original.id);
                }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </button>
            </TableCell>
          );
        }

        // ── Actions cell — inject approve + delete ────────────────────────────
        if (cell.column.id === "actions") {
          const task = row.original;
          const isApproving = approvingId === task.id;
          const isDeleting = deletingId === task.id;
          const canApprove = isPrivileged && task.status !== "APPROVED";

          return (
            <TableCell key={cell.id}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
                    size="icon"
                  >
                    <IconDotsVertical />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem asChild>
                    <Link href={`/tasks/${task.id}`}>View Details</Link>
                  </DropdownMenuItem>

                  {/* Approve */}
                  {canApprove && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onApprove(task.id)}
                        disabled={isApproving}
                        className="text-green-600 focus:text-green-600 focus:bg-green-50"
                      >
                        {isApproving ? (
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <IconCheck className="mr-2 h-4 w-4" />
                        )}
                        Approve Task
                      </DropdownMenuItem>
                    </>
                  )}

                  {/* Delete - Only for privileged users */}
                  {isPrivileged && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(task.id)}
                        disabled={isDeleting}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        {isDeleting ? (
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <IconTrash className="mr-2 h-4 w-4" />
                        )}
                        Delete Task
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          );
        }

        return (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ProjectTasksTable({
  tasks: initialTasks,
  hideTitleRow = false,
  userRole = "",
  userId = "",
  userName = "",
}: {
  tasks: ProjectTask[];
  hideTitleRow?: boolean;
  userRole?: string;
  userId?: string;
  userName?: string;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(() => initialTasks);
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "created_at", desc: true },
  ]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Sheet state
  const [sheetTaskId, setSheetTaskId] = React.useState<string | null>(null);

  // ── Approve/Delete State ───────────────────────────────────────────────────
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  const isPrivileged =
    userRole === "ADMIN" ||
    userRole === "PROJECT_MANAGER" ||
    userRole === "TEAM_LEADER";

  const sortableId = React.useId();
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );
  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data.map((d) => d.id),
    [data],
  );

  React.useEffect(() => {
    setData(initialTasks);
  }, [initialTasks]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setData((d) => {
        const oldIndex = dataIds.indexOf(active.id);
        const newIndex = dataIds.indexOf(over.id);
        return arrayMove(d, oldIndex, newIndex);
      });
    }
  }

  // ── Approve Task Handler ───────────────────────────────────────────────────
  async function handleApprove(taskId: string) {
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
      toast.success("Task approved");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to approve task",
      );
    } finally {
      setApprovingId(null);
    }
  }

  // ── Delete Task Handlers ───────────────────────────────────────────────────
  function handleDelete(taskId: string) {
    setTaskToDelete(taskId);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!taskToDelete) return;
    setDeletingId(taskToDelete);
    try {
      const res = await fetch(`/api/tasks/${taskToDelete}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to delete");
      }
      setData((prev) => prev.filter((t) => t.id !== taskToDelete));
      toast.success("Task deleted");
      router.refresh();
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Card>
        {!hideTitleRow && (
          <CardHeader>
            <CardTitle className="text-lg">Tasks ({data.length})</CardTitle>
          </CardHeader>
        )}
        <CardContent className={hideTitleRow ? "pt-4" : ""}>
          <div className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {table.getFilteredSelectedRowModel().rows.length > 0
                  ? `${table.getFilteredSelectedRowModel().rows.length} selected`
                  : `${table.getFilteredRowModel().rows.length} task${table.getFilteredRowModel().rows.length === 1 ? "" : "s"}`}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <IconLayoutColumns className="mr-1.5 h-4 w-4" />
                    <span className="hidden sm:inline">Columns</span>
                    <IconChevronDown className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {table
                    .getAllColumns()
                    .filter(
                      (c) =>
                        typeof c.accessorFn !== "undefined" && c.getCanHide(),
                    )
                    .map((col) => (
                      <DropdownMenuCheckboxItem
                        key={col.id}
                        className="capitalize"
                        checked={col.getIsVisible()}
                        onCheckedChange={(v) => col.toggleVisibility(!!v)}
                      >
                        {col.id
                          .replace(/([A-Z])/g, " $1")
                          .replace(/_/g, " ")
                          .toLowerCase()}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-lg border">
              <DndContext
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
                sensors={sensors}
                id={sortableId}
              >
                <Table>
                  <TableHeader className="bg-muted sticky top-0 z-10">
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((h) => (
                          <TableHead key={h.id} colSpan={h.colSpan}>
                            {h.isPlaceholder
                              ? null
                              : flexRender(
                                  h.column.columnDef.header,
                                  h.getContext(),
                                )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody className="**:data-[slot=table-cell]:first:w-8">
                    {table.getRowModel().rows.length ? (
                      <SortableContext
                        items={dataIds}
                        strategy={verticalListSortingStrategy}
                      >
                        {table.getRowModel().rows.map((row) => (
                          <DraggableRow
                            key={row.id}
                            row={row}
                            onTaskClick={setSheetTaskId}
                            onApprove={handleApprove}
                            approvingId={approvingId}
                            onDelete={handleDelete}
                            deletingId={deletingId}
                            isPrivileged={isPrivileged}
                          />
                        ))}
                      </SortableContext>
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No tasks found for this project.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </DndContext>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <div className="hidden text-sm text-muted-foreground lg:block">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <div className="hidden items-center gap-2 lg:flex">
                  <Label htmlFor="pt-rows" className="text-sm">
                    Rows
                  </Label>
                  <Select
                    value={`${table.getState().pagination.pageSize}`}
                    onValueChange={(v) => table.setPageSize(Number(v))}
                  >
                    <SelectTrigger size="sm" className="w-16" id="pt-rows">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {[5, 10, 20, 50].map((s) => (
                        <SelectItem key={s} value={`${s}`}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden size-8 lg:flex"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <IconChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <IconChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <IconChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden size-8 lg:flex"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    <IconChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Sheet - Opens on task click */}
      <TaskSheet
        taskId={sheetTaskId}
        userRole={userRole}
        userId={userId}
        userName={userName}
        onClose={() => setSheetTaskId(null)}
        onTaskUpdated={(updated: Partial<SheetTaskData>) => {
          if (updated.id) {
            setData((prev) =>
              prev.map((t) =>
                t.id === updated.id
                  ? { ...t, ...(updated as Partial<ProjectTask>) }
                  : t,
              ),
            );
          }
        }}
      />

      {/* ── Delete Confirmation Dialog ── */}
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
              disabled={deletingId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deletingId !== null}
            >
              {deletingId ? (
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
    </>
  );
}
