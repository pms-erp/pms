"use client";

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";

// ─── Date Formatting Helpers ─────────────────────────────────────────────────

/**
 * Format date with Month Name, Day, and Year (e.g., "Jan 15, 2026")
 */
function formatDateShort(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric", // ✅ Always include year
  });
}

/**
 * Format full date/time for tooltips (e.g., "Mon, Jan 15, 2026 at 2:30 PM")
 */
function formatFullDateTime(date: string | Date | null | undefined): string {
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
}

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateShort(date);
}

// ─── Date Cell Component ─────────────────────────────────────────────────────

interface DateCellProps {
  value: unknown;
  mode?: "short" | "relative" | "full";
  showTooltip?: boolean;
  className?: string;
}

function DateCell({
  value,
  mode = "short",
  showTooltip = true,
  className = "",
}: DateCellProps) {
  const dateValue = value as string | Date | null | undefined;

  let displayText: string;
  let tooltipText: string | undefined;

  switch (mode) {
    case "relative":
      displayText = formatRelativeTime(dateValue);
      tooltipText = showTooltip ? formatFullDateTime(dateValue) : undefined;
      break;
    case "full":
      displayText = formatFullDateTime(dateValue) || "—";
      tooltipText = undefined;
      break;
    case "short":
    default:
      // Uses the helper that includes Year
      displayText = formatDateShort(dateValue);
      tooltipText = showTooltip ? formatFullDateTime(dateValue) : undefined;
  }

  const content = (
    <div
      className={`text-sm text-muted-foreground whitespace-nowrap ${showTooltip ? "cursor-help" : ""} ${className}`}
    >
      {displayText}
    </div>
  );

  if (showTooltip && tooltipText) {
    return (
      <div title={tooltipText} className="contents">
        {content}
      </div>
    );
  }
  return content;
}

// ─── Props Interface ─────────────────────────────────────────────────────────

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  /** Optional: column keys that contain date values to auto-format */
  dateColumns?: string[];
  /** Optional: date format mode for auto-formatted columns */
  dateFormat?: "short" | "relative" | "full";
  /** Optional: show tooltip on hover for date cells */
  showDateTooltip?: boolean;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DataTable<TData, TValue>({
  columns,
  data,
  pageSize = 20,
  dateColumns = [],
  dateFormat = "short",
  showDateTooltip = true,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageIndex: 0, pageSize },
    },
  });

  const { pageIndex, pageSize: ps } = table.getState().pagination;
  const total = data.length;
  const from = total === 0 ? 0 : pageIndex * ps + 1;
  const to = Math.min(from + ps - 1, total);
  const pageCount = table.getPageCount();

  // Helper to check if a column should be auto-formatted as date
  const isDateColumn = (columnId: string | undefined): boolean => {
    if (!columnId) return false;
    return dateColumns.some((dc) => {
      if (dc.includes(".")) {
        const parts = dc.split(".");
        return parts.every((p, i) => {
          if (i === 0) return columnId === p || columnId.startsWith(`${p}.`);
          return columnId.endsWith(`.${p}`) || columnId === p;
        });
      }
      return columnId === dc || columnId.endsWith(`.${dc}`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
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
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => {
                    const columnId = cell.column.id;
                    const value = cell.getValue();

                    // Auto-format date columns if configured
                    if (
                      isDateColumn(columnId) &&
                      (typeof value === "string" || value instanceof Date)
                    ) {
                      return (
                        <TableCell key={cell.id} className="whitespace-nowrap">
                          <DateCell
                            value={value}
                            mode={dateFormat}
                            showTooltip={showDateTooltip}
                          />
                        </TableCell>
                      );
                    }

                    return (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No projects found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination bar — only show when there are rows */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* row count */}
          <p className="text-sm text-muted-foreground">
            Showing {from}–{to} of {total} project{total !== 1 ? "s" : ""}
          </p>

          {/* page navigation */}
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">
              Page {pageIndex + 1} of {pageCount}
            </span>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              title="First page"
            >
              <IconChevronsLeft size={15} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              title="Previous page"
            >
              <IconChevronLeft size={15} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              title="Next page"
            >
              <IconChevronRight size={15} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              title="Last page"
            >
              <IconChevronsRight size={15} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export helpers for use in column definitions ────────────────────────────

export { formatDateShort, formatFullDateTime, formatRelativeTime, DateCell };
