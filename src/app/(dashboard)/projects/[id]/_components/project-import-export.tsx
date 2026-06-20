// app/(dashboard)/projects/_components/project-import-export.tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  IconDownload,
  IconUpload,
  IconDotsVertical,
  IconLoader,
  IconFileExport,
  IconFileImport,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react";

// ─── Export Button ─────────────────────────────────────────────────────────────

interface ExportButtonProps {
  projectId: string;
  projectName: string;
}

export function ProjectExportButton({
  projectId,
  projectName,
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Export failed");
      }

      // Stream to file download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match?.[1] ?? `${projectName}_export.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Project exported successfully", {
        description: `Downloaded ${a.download}`,
      });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={exporting}
      className="gap-2"
    >
      {exporting ? (
        <IconLoader className="h-4 w-4 animate-spin" />
      ) : (
        <IconFileExport className="h-4 w-4" />
      )}
      {exporting ? "Exporting…" : "Export"}
    </Button>
  );
}

// ─── Import Button (standalone — on projects list page) ───────────────────────

interface ImportButtonProps {
  onImported?: (projectId: string) => void;
}

export function ProjectImportButton({ onImported }: ImportButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<{
    projectName: string;
    taskCount: number;
    noteCount: number;
  } | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setFileError("Only .json export files are supported.");
      setPreviewData(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text) as {
          project?: { name?: string };
          tasks?: unknown[];
          notes?: unknown[];
        };

        if (!data.project?.name) {
          setFileError("Invalid export file — missing project data.");
          setPreviewData(null);
          return;
        }

        setFileContent(text);
        setFileError(null);
        setPreviewData({
          projectName: data.project.name,
          taskCount: (data.tasks ?? []).length,
          noteCount: (data.notes ?? []).length,
        });
      } catch {
        setFileError("Could not parse file. Make sure it's a valid export.");
        setPreviewData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!fileContent) return;
    setImporting(true);
    try {
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: fileContent,
      });

      const data = (await res.json()) as {
        success?: boolean;
        project_id?: string;
        imported?: { tasks: number; notes: number };
        error?: string;
      };

      if (!res.ok || !data.success)
        throw new Error(data.error ?? "Import failed");

      toast.success("Project imported successfully", {
        description: `${data.imported?.tasks ?? 0} tasks · ${data.imported?.notes ?? 0} notes`,
      });

      setOpen(false);
      onImported?.(data.project_id!);
      router.refresh();
    } catch (err) {
      toast.error("Import failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setPreviewData(null);
    setFileContent(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <IconFileImport className="h-4 w-4" />
          Import Project
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconFileImport className="h-5 w-5 text-primary" />
            Import Project
          </DialogTitle>
          <DialogDescription>
            Upload a project export file (.json) to restore the project, its
            tasks, and all comments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Drop zone */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file && fileInputRef.current) {
                // Programmatically trigger the same handler
                const dt = new DataTransfer();
                dt.items.add(file);
                fileInputRef.current.files = dt.files;
                fileInputRef.current.dispatchEvent(
                  new Event("change", { bubbles: true }),
                );
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileSelect}
            />
            <IconUpload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Drop your export file here</p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse · .json only
            </p>
          </div>

          {/* Error */}
          {fileError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400">
              <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="text-sm">{fileError}</p>
            </div>
          )}

          {/* Preview */}
          {previewData && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconCheck className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-sm font-medium">
                  File looks good — ready to import
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 rounded-md bg-background border">
                  <p className="text-lg font-bold text-primary">1</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Project
                  </p>
                </div>
                <div className="text-center p-2 rounded-md bg-background border">
                  <p className="text-lg font-bold text-primary">
                    {previewData.taskCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Tasks
                  </p>
                </div>
                <div className="text-center p-2 rounded-md bg-background border">
                  <p className="text-lg font-bold text-primary">
                    {previewData.noteCount}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Notes
                  </p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground p-2 rounded bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                <strong>Note:</strong> Tasks will be assigned to you as the
                importer. Original assignees are preserved as reference in task
                data.
              </div>
              <p className="text-sm font-semibold truncate">
                `{previewData.projectName}`
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!previewData || importing}
            className="gap-2"
          >
            {importing ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <IconFileImport className="h-4 w-4" />
                Import Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Combined menu (for project detail page header) ───────────────────────────

interface ProjectActionsMenuProps {
  projectId: string;
  projectName: string;
  canManage: boolean;
}

export function ProjectActionsMenu({
  projectId,
  projectName,
  canManage,
}: ProjectActionsMenuProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: match?.[1] ?? `${projectName}_export.json`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Project exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (!canManage) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <IconDotsVertical className="h-4 w-4 mr-1" />
          More
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={handleExport}
          disabled={exporting}
          className="gap-2"
        >
          {exporting ? (
            <IconLoader className="h-4 w-4 animate-spin" />
          ) : (
            <IconDownload className="h-4 w-4" />
          )}
          Export Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
