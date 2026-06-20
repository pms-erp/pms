"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

export type Project = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  taskCount: number;
  created_at: Date;
};

const STATUS_STYLES: Record<string, string> = {
  PLANNING:
    "bg-slate-100  text-slate-700  border-slate-200  dark:bg-slate-800  dark:text-slate-300",
  ACTIVE:
    "bg-green-100  text-green-700  border-green-200  dark:bg-green-900  dark:text-green-300",
  IN_QA:
    "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300",
  ON_HOLD:
    "bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900  dark:text-amber-300",
  COMPLETED:
    "bg-blue-100   text-blue-700   border-blue-200   dark:bg-blue-900   dark:text-blue-300",
  CANCELLED:
    "bg-red-100    text-red-700    border-red-200    dark:bg-red-900    dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  IN_QA: "In QA",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const columns: ColumnDef<Project>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Project",
    cell: ({ row }) => {
      const project = row.original;
      return (
        <Link
          href={`/projects/${project.id}`}
          className="font-medium text-primary hover:underline inline-block"
        >
          {project.name}
        </Link>
      );
    },
  },
  {
    accessorKey: "client_name",
    header: "Client",
    cell: ({ row }) => {
      const clientName = row.getValue("client_name") as string;
      return clientName || "—";
    },
  },
  {
    accessorKey: "taskCount",
    header: "Tasks",
    cell: ({ row }) => {
      const count = row.getValue("taskCount") as number;
      return <span className="font-medium">{count}</span>;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge
          variant="outline"
          className={`font-medium ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}
        >
          {STATUS_LABELS[status] ?? status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Created",
    cell: ({ row }) =>
      new Date(row.getValue("created_at")).toLocaleDateString(),
  },
];
