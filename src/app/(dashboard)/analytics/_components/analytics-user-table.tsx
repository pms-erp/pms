// components/analytics-user-table.tsx
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  IconChevronDown,
  IconChevronUp,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconMedal,
} from "@tabler/icons-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UserPerformance {
  id: string;
  name: string;
  username: string;
  role: string;
  avatar: string | null;
  team_type: string | null;
  total: number;
  approved: number;
  rework: number;
  inProgress: number;
  waitingQA: number;
  avgRework: number; // avg rework_count per task
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100    text-red-700    border-red-200",
  PROJECT_MANAGER: "bg-blue-100   text-blue-700   border-blue-200",
  TEAM_LEADER: "bg-yellow-100 text-yellow-700 border-yellow-200",
  DEVELOPER: "bg-green-100  text-green-700  border-green-200",
  DESIGNER: "bg-pink-100   text-pink-700   border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  QA: "bg-purple-100 text-purple-700 border-purple-200",
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function SortHeader({
  label,
  column,
  sorting,
}: {
  label: string;
  column: string;
  sorting: SortingState;
}) {
  const active = sorting.find((s) => s.id === column);
  return (
    <div className="flex items-center gap-1">
      {label}
      {active ? (
        active.desc ? (
          <IconChevronDown className="h-3.5 w-3.5" />
        ) : (
          <IconChevronUp className="h-3.5 w-3.5" />
        )
      ) : (
        <IconChevronDown className="h-3.5 w-3.5 opacity-30" />
      )}
    </div>
  );
}

// ── Columns ────────────────────────────────────────────────────────────────────

function buildColumns(sorting: SortingState): ColumnDef<UserPerformance>[] {
  return [
    {
      id: "rank",
      header: "#",
      cell: ({ row }) => {
        const rank = row.index + 1;
        return (
          <div className="flex items-center justify-center w-7">
            {rank === 1 ? (
              "🥇"
            ) : rank === 2 ? (
              "🥈"
            ) : rank === 3 ? (
              "🥉"
            ) : (
              <span className="text-sm text-muted-foreground font-medium">
                {rank}
              </span>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "name",
      header: "User",
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={u.avatar ?? undefined} />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {getInitials(u.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{u.name}</p>
              <p className="text-xs text-muted-foreground">@{u.username}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      header: "Role",
      enableSorting: false,
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={`text-xs ${ROLE_COLORS[row.original.role] ?? ""}`}
        >
          {row.original.role.replace(/_/g, " ")}
        </Badge>
      ),
    },
    {
      accessorKey: "total",
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => column.toggleSorting()}
        >
          <SortHeader label="Total" column="total" sorting={sorting} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">{row.original.total}</span>
      ),
    },
    {
      accessorKey: "approved",
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => column.toggleSorting()}
        >
          <SortHeader label="Approved" column="approved" sorting={sorting} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-green-600 font-semibold tabular-nums">
          {row.original.approved}
        </span>
      ),
    },
    {
      accessorKey: "rework",
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => column.toggleSorting()}
        >
          <SortHeader label="Rework" column="rework" sorting={sorting} />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span
            className={`font-semibold tabular-nums ${row.original.rework > 0 ? "text-red-600" : "text-muted-foreground"}`}
          >
            {row.original.rework}
          </span>
          {row.original.avgRework > 0 && (
            <span className="text-xs text-muted-foreground">
              ({row.original.avgRework.toFixed(1)}×)
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "inProgress",
      header: "In Progress",
      cell: ({ row }) => (
        <span className="text-orange-600 font-medium tabular-nums">
          {row.original.inProgress}
        </span>
      ),
    },
    {
      accessorKey: "waitingQA",
      header: "Waiting QA",
      cell: ({ row }) => (
        <span className="text-purple-600 font-medium tabular-nums">
          {row.original.waitingQA}
        </span>
      ),
    },
    {
      id: "approvalRate",
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 cursor-pointer"
          onClick={() => column.toggleSorting()}
        >
          <SortHeader label="Rate" column="approvalRate" sorting={sorting} />
        </button>
      ),
      accessorFn: (row) =>
        row.total > 0 ? Math.round((row.approved / row.total) * 100) : 0,
      cell: ({ row }) => {
        const rate =
          row.original.total > 0
            ? Math.round((row.original.approved / row.original.total) * 100)
            : 0;
        return (
          <div className="flex items-center gap-2 min-w-[90px]">
            <Progress value={rate} className="h-1.5 flex-1" />
            <span
              className={`text-xs font-semibold w-9 text-right tabular-nums ${
                rate >= 70
                  ? "text-green-600"
                  : rate >= 50
                    ? "text-amber-600"
                    : "text-red-600"
              }`}
            >
              {rate}%
            </span>
          </div>
        );
      },
    },
  ];
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AnalyticsUserTable({ data }: { data: UserPerformance[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "approved", desc: true },
  ]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const columns = React.useMemo(() => buildColumns(sorting), [sorting]);

  // Sort by approved desc initially
  const sortedData = React.useMemo(
    () => [...data].sort((a, b) => b.approved - a.approved),
    [data],
  );

  const table = useReactTable({
    data: sortedData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconMedal className="h-5 w-5 text-yellow-500" />
              User Performance Leaderboard
            </CardTitle>
            <CardDescription className="mt-1">
              Ranked by approved tasks · Click column headers to sort
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-sm">
            {data.length} members
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id}>
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/50">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No user data yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length} members total
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="aup-rows" className="text-sm">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(v) => table.setPageSize(Number(v))}
              >
                <SelectTrigger size="sm" className="w-16" id="aup-rows">
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
            <span className="text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </span>
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
      </CardContent>
    </Card>
  );
}
