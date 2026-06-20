// components/user-tasks-table.tsx
"use client";

import * as React from "react";
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
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  IconChevronDown,
  IconClock,
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { TaskSheet, SheetTaskData } from "../../tasks/_components/task-sheet";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserTask {
  id: string;
  title: string;
  project_name: string | null;
  project_id: string | null;
  team_type: string | null;
  priority: string | null;
  status: string;
  estimated_minutes: number | null;
  created_at: Date;

  // Additional fields required for TaskSheet functionality
  description?: string | null;
  assigned_to?: string | null;
  assignedUserName?: string | null;
  assignedUserAvatar?: string | null;
  assignedByUsername?: string | null;
  qa_assigned_to?: string | null;
  qaAssignedUserName?: string | null;
  files?: string | null;
  rework_count?: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  WAITING_FOR_QA: {
    label: "Waiting for QA",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-green-100 text-green-700 border-green-200",
  },
  REWORK: {
    label: "Rework",
    className: "bg-red-100 text-red-700 border-red-200",
  },
};

const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  HIGH: {
    label: "High",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  MEDIUM: {
    label: "Medium",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  LOW: {
    label: "Low",
    className: "bg-green-100 text-green-700 border-green-200",
  },
};

function formatTime(minutes: number | null): string {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Drag Handle ────────────────────────────────────────────────────────────────

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id });
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-7 hover:bg-transparent cursor-grab active:cursor-grabbing"
    >
      <IconGripVertical className="size-3" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  );
}

// ── Columns ────────────────────────────────────────────────────────────────────

const columns: ColumnDef<UserTask>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
    enableSorting: false,
    enableHiding: false,
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
    header: "Task Title",
    cell: ({ row }) => (
      // Render as span, click handler is managed in DraggableRow
      <span className="font-medium text-primary hover:underline cursor-pointer line-clamp-1 max-w-[200px] block">
        {row.original.title}
      </span>
    ),
  },
  {
    accessorKey: "project_name",
    header: "Project",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground truncate max-w-[140px] block">
        {row.original.project_name ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "team_type",
    header: "Team",
    cell: ({ row }) => (
      <span className="text-sm capitalize">
        {row.original.team_type?.toLowerCase() ?? "—"}
      </span>
    ),
  },
  {
    accessorKey: "priority",
    header: "Priority",
    cell: ({ row }) => {
      const p = row.original.priority;
      const style = p ? PRIORITY_STYLES[p] : null;
      return style ? (
        <Badge variant="outline" className={`text-xs ${style.className}`}>
          {style.label}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-sm">—</span>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = STATUS_STYLES[row.original.status];
      return (
        <Badge variant="outline" className={`text-xs ${s?.className ?? ""}`}>
          {s?.label ?? row.original.status.replace(/_/g, " ")}
        </Badge>
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
    cell: ({ row }) => (
      <span className="text-sm font-medium">
        {formatTime(row.original.estimated_minutes)}
      </span>
    ),
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {new Date(row.original.created_at).toLocaleDateString()}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="size-8 p-0" size="icon">
            <IconDotsVertical className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem asChild>
            <Link href={`/tasks/${row.original.id}`}>View Details</Link>
          </DropdownMenuItem>
          {row.original.project_id && (
            <DropdownMenuItem asChild>
              <Link href={`/projects/${row.original.project_id}`}>
                View Project
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

// ── Draggable Row with Sheet Integration ──────────────────────────────────────

function DraggableRow({
  row,
  onTaskClick,
}: {
  row: Row<UserTask>;
  onTaskClick: (taskId: string) => void;
}) {
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
        // Intercept the title cell to add click handler for sheet
        if (cell.column.id === "title") {
          return (
            <TableCell
              key={cell.id}
              className={`font-medium max-w-[200px] truncate ${isApproved ? "line-through text-muted-foreground" : ""}`}
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

interface UserTasksTableProps {
  tasks: UserTask[];
  userRole?: string;
  userId?: string;
  userName?: string;
}

export function UserTasksTable({
  tasks,
  userRole = "",
  userId = "",
  userName = "",
}: UserTasksTableProps) {
  const [data, setData] = React.useState(tasks);
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

  // Sheet state
  const [sheetTaskId, setSheetTaskId] = React.useState<string | null>(null);

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

  // Update local state if props change (e.g., after revalidation)
  React.useEffect(() => {
    setData(tasks);
  }, [tasks]);

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

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed rounded-lg">
        <p className="text-muted-foreground">No tasks assigned yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <IconLayoutColumns className="mr-2 h-4 w-4" />
                  Columns
                  <IconChevronDown className="ml-2 h-4 w-4" />
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
          </div>
        </div>

        {/* Table Container */}
        <div className="rounded-md border">
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
              <TableBody>
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
                      />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between space-x-2 py-4">
          <div className="flex-1 text-sm text-muted-foreground">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="flex items-center space-x-6 lg:space-x-8">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium">Rows per page</p>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className="h-8 w-[70px]">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-[100px] items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <IconChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <IconChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <IconChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <IconChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

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
                t.id === updated.id ? ({ ...t, ...updated } as UserTask) : t,
              ),
            );
          }
        }}
      />
    </>
  );
}
