"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import {
  IconArrowLeft,
  IconExternalLink,
  IconEdit,
  IconCheck,
  IconX,
  IconTrash,
  IconLoader2,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { projectEvents } from "@/lib/events";
import { ProjectActionsMenu } from "./project-import-export";

interface ProjectHeaderProps {
  projectId: string;
  project: {
    name: string;
    client_name: string | null;
    website_url: string | null;
    status: string;
  };
  canEdit: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PLANNING: {
    label: "Planning",
    className:
      "bg-slate-100  text-slate-700  border-slate-200  dark:bg-slate-800  dark:text-slate-300",
  },
  ACTIVE: {
    label: "Active",
    className:
      "bg-green-100  text-green-700  border-green-200  dark:bg-green-900  dark:text-green-300",
  },
  IN_QA: {
    label: "In QA",
    className:
      "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900 dark:text-purple-300",
  },
  ON_HOLD: {
    label: "On Hold",
    className:
      "bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-900  dark:text-amber-300",
  },
  COMPLETED: {
    label: "Completed",
    className:
      "bg-blue-100   text-blue-700   border-blue-200   dark:bg-blue-900   dark:text-blue-300",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-red-100    text-red-700    border-red-200    dark:bg-red-900    dark:text-red-300",
  },
};

export function ProjectHeader({
  projectId,
  project,
  canEdit,
}: ProjectHeaderProps) {
  const router = useRouter();
  const [editingName, setEditingName] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [statusValue, setStatusValue] = useState(project.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusCfg = STATUS_CONFIG[statusValue] ?? {
    label: statusValue,
    className: "",
  };

  async function patchProject(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveName() {
    if (!nameValue.trim() || nameValue === project.name) {
      setNameValue(project.name);
      setEditingName(false);
      return;
    }
    const ok = await patchProject({ name: nameValue.trim() });
    if (ok) {
      setEditingName(false);
      toast.success("Project name updated");
    }
  }

  async function saveStatus(val: string) {
    setStatusValue(val);
    setEditingStatus(false);
    const ok = await patchProject({ status: val });
    if (ok) toast.success("Status updated");
    else setStatusValue(project.status);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      toast.success("Project deleted");
      router.push("/projects");
      projectEvents.triggerProjectDeleted();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <Button variant="ghost" size="icon" asChild className="mt-1 shrink-0">
          <button onClick={() => router.back()}>
            <IconArrowLeft className="h-5 w-5" />
          </button>
        </Button>

        <div className="flex-1 min-w-0">
          {/* Project name — inline edit */}
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="text-2xl font-bold h-auto py-1 px-2 max-w-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setNameValue(project.name);
                    setEditingName(false);
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={saveName}
                disabled={saving}
              >
                {saving ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconCheck className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setNameValue(project.name);
                  setEditingName(false);
                }}
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/name">
              <h1 className="text-3xl font-bold tracking-tight truncate">
                {nameValue}
              </h1>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="opacity-0 group-hover/name:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  title="Edit name"
                >
                  <IconEdit className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Subtitle — client + website */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            {project.client_name && (
              <span className="text-muted-foreground text-sm">
                {project.client_name}
              </span>
            )}
            {project.client_name && project.website_url && (
              <span className="text-muted-foreground/40 text-sm">·</span>
            )}
            {project.website_url && (
              <a
                href={project.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                {project.website_url.replace(/^https?:\/\//, "")}
                <IconExternalLink className="h-3 w-3" />
              </a>
            )}
            {!project.client_name && !project.website_url && (
              <span className="text-muted-foreground text-sm">
                No client specified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right — status + delete */}
      {/* Right — actions + status + delete */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Actions Menu (NEW) */}
        <ProjectActionsMenu
          projectId={projectId}
          projectName={project.name}
          canManage={canEdit}
        />

        {/* Status */}
        {canEdit && editingStatus ? (
          <Select value={statusValue} onValueChange={saveStatus}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                <SelectItem key={val} value={val}>
                  {cfg.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="group/status flex items-center gap-1">
            <Badge
              variant="outline"
              className={`text-sm px-3 py-1 font-medium ${statusCfg.className} ${canEdit ? "cursor-pointer" : ""}`}
              onClick={() => canEdit && setEditingStatus(true)}
            >
              {statusCfg.label}
            </Badge>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingStatus(true)}
                className="opacity-0 group-hover/status:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
              >
                <IconEdit className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Delete */}
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                disabled={deleting}
              >
                {deleting ? (
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <IconTrash className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{nameValue}</strong> and
                  all of its tasks.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
