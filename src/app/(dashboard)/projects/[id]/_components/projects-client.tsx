"use client";

import { useState } from "react";
import { DataTable } from "../../data-table";
import { columns } from "../../columns";
import { CreateProjectDialog } from "../../create-project-dialog";
import { StatusFilter } from "../../status-filter";
import {
  IconFolderCheck,
  IconFolderOpen,
  IconFolderX,
  IconEye,
} from "@tabler/icons-react";
import { AsanaImportDialog } from "./asana-import-dialog";

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  created_at: Date;
  taskCount: number;
  [key: string]: unknown;
}

interface Props {
  data: Project[];
  viewerProjectIds: string[];
  projectViewerCount: number;
  canCreate: boolean;
  search: string;
  total: number;
}

type ActiveFilter = "ACTIVE" | "COMPLETED" | "CANCELLED" | "VIEWER" | null;

export function ProjectsClient({
  data,
  viewerProjectIds,
  projectViewerCount,
  canCreate,
  search,
  total,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);

  const filteredData =
    activeFilter === null
      ? data
      : activeFilter === "VIEWER"
        ? data.filter((p) => viewerProjectIds.includes(p.id))
        : data.filter((p) => p.status === activeFilter);

  const stats = {
    active: data.filter((p) => p.status === "ACTIVE").length,
    completed: data.filter((p) => p.status === "COMPLETED").length,
    cancelled: data.filter((p) => p.status === "CANCELLED").length,
  };

  const cards = [
    {
      key: "ACTIVE" as ActiveFilter,
      label: "Active",
      count: stats.active,
      icon: <IconFolderOpen className="h-5 w-5 text-green-600" />,
      bg: "bg-green-100",
      border: "border-green-200",
      text: "text-green-700",
      ring: "ring-green-400",
    },
    {
      key: "COMPLETED" as ActiveFilter,
      label: "Completed",
      count: stats.completed,
      icon: <IconFolderCheck className="h-5 w-5 text-blue-600" />,
      bg: "bg-blue-100",
      border: "border-blue-200",
      text: "text-blue-700",
      ring: "ring-blue-400",
    },
    {
      key: "CANCELLED" as ActiveFilter,
      label: "Cancelled",
      count: stats.cancelled,
      icon: <IconFolderX className="h-5 w-5 text-red-600" />,
      bg: "bg-red-100",
      border: "border-red-200",
      text: "text-red-700",
      ring: "ring-red-400",
    },
    {
      key: "VIEWER" as ActiveFilter,
      label: "Viewer",
      count: projectViewerCount,
      icon: <IconEye className="h-5 w-5 text-teal-600" />,
      bg: "bg-teal-100",
      border: "border-teal-200",
      text: "text-teal-700",
      ring: "ring-teal-400",
    },
  ];

  return (
    <>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4 lg:gap-0">
        <h1 className="text-2xl font-semibold whitespace-nowrap">Projects</h1>
        <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
          {canCreate && <AsanaImportDialog />}
          <StatusFilter />
          {canCreate && <CreateProjectDialog />}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(({ key, label, count, icon, bg, border, text, ring }) => {
          const isActive = activeFilter === key;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setActiveFilter(isActive ? null : key)}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-all text-left
                ${bg} ${border}
                ${isActive ? `ring-2 ${ring} shadow-md` : "hover:shadow-sm hover:scale-[1.02]"}
              `}
            >
              <div className="h-10 w-10 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                {icon}
              </div>
              <div>
                <p className={`text-2xl font-bold ${text}`}>{count}</p>
                <p className={`text-xs font-medium ${text} opacity-80`}>
                  {label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active filter label */}
      {activeFilter && (
        <p className="text-sm text-muted-foreground mb-3">
          Showing{" "}
          <span className="font-medium text-foreground">{activeFilter}</span>{" "}
          projects ({filteredData.length}) ·{" "}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => setActiveFilter(null)}
          >
            Clear filter
          </button>
        </p>
      )}

      {/* Search result label */}
      {search && !activeFilter && (
        <p className="text-sm text-muted-foreground mb-4">
          {total} result{total !== 1 ? "s" : ""} for{" "}
          <span className="font-medium text-foreground">{`"${search}"`}</span>
        </p>
      )}

      <DataTable
        columns={columns}
        data={filteredData}
        dateColumns={["created_at"]}
        pageSize={20}
      />
    </>
  );
}
