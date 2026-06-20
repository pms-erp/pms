// components/dashboard-data-table.tsx
"use client";

import * as React from "react";
import { useState } from "react";
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
import { useRouter } from "next/navigation";

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TaskSheet,
  SheetTaskData,
} from "@/../src/app/(dashboard)/tasks/_components/task-sheet";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardTask {
  id: string;
  title: string;
  projectName: string | null;
  team_type: string | null;
  priority: string | null;
  status: string;
  assignedToName: string | null;
  assignedUserAvatar?: string | null;
  estimated_minutes: number | null;
  description?: string | null;
  assigned_to?: string | null;
  assignedByUsername?: string | null;
  qa_assigned_to?: string | null;
  qaAssignedUserName?: string | null;
  files?: string | null;
  rework_count?: number | null;
  created_at?: string | Date | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "bg-orange-100 text-orange-700 border-orange-200",
  WAITING_FOR_QA: "bg-purple-100 text-purple-700 border-purple-200",
  APPROVED: "bg-green-100 text-green-700 border-green-200",
  REWORK: "bg-red-100 text-red-700 border-red-200",
};
const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
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

// ── Static columns (no handlers needed here) ──────────────────────────────────

const columns: ColumnDef<DashboardTask>[] = [
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
    accessorKey: "projectName",
    header: "Project",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate max-w-[140px] block">
        {row.original.projectName ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className={`text-xs ${STATUS_COLORS[row.original.status] ?? ""}`}
      >
        {row.original.status.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) =>
      row.original.priority ? (
        <Badge
          variant="outline"
          className={`text-xs ${PRIORITY_COLORS[row.original.priority] ?? ""}`}
        >
          {row.original.priority}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "assignedToName",
    header: "Assigned To",
    cell: ({ row }) => {
      const name = row.original.assignedToName;
      const avatar = row.original.assignedUserAvatar;
      if (!name)
        return (
          <span className="text-sm text-muted-foreground">Unassigned</span>
        );
      const initials = name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      return (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={avatar ?? undefined} />
            <AvatarFallback className="text-[10px] bg-blue-600 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate">{name}</span>
        </div>
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
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem asChild>
            <Link href={`/tasks/${row.original.id}`}>View Details</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

// ── Draggable Row ─────────────────────────────────────────────────────────────

interface DraggableRowProps {
  row: Row<DashboardTask>;
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

export function DashboardDataTable({
  data: initialData,
  userRole = "",
  userId = "",
  userName = "",
}: {
  data: DashboardTask[];
  userRole?: string;
  userId?: string;
  userName?: string;
}) {
  const router = useRouter();

  const [data, setData] = React.useState(() => initialData);
  const [sheetTaskId, setSheetTaskId] = React.useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);

  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });

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
    setData(initialData);
  }, [initialData]);

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

  // ── Delete Task Handler ─────────────────────────────────────────────────────
  async function handleDelete(taskId: string) {
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
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 lg:px-6">
          <h2 className="text-base font-semibold">Recent Tasks</h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <IconLayoutColumns />
                  <span className="hidden lg:inline">Columns</span>
                  <IconChevronDown />
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
                      {col.id.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild variant="outline" size="sm">
              <Link href="/tasks">View all tasks</Link>
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border mx-4 lg:mx-6">
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
                      No tasks found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 lg:px-6">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="flex w-full items-center gap-6 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[5, 10, 20].map((s) => (
                    <SelectItem key={s} value={`${s}`}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Task Sheet */}
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
                  ? ({ ...t, ...updated } as DashboardTask)
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
