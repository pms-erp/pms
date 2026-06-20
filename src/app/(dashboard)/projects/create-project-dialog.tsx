"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createProjectSchema } from "@/lib/projects/validation";
import {
  IconWorld,
  IconAlignLeft,
  IconUpload,
  IconX,
  IconPaperclip,
  IconLoader,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { projectEvents } from "@/lib/events";
import { ProjectImportButton } from "./[id]/_components/project-import-export";
import { uploadFile as uploadFileFn, deleteFile } from "@/lib/upload-file";

type UploadedFile = {
  url: string;
  public_id: string;
  name: string;
  resource_type: string;
  size: number;
  storage?: string; // ← Add this line
};

// Track upload status per file
type PendingFile = {
  file: File;
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  uploadedData?: UploadedFile;
  error?: string;
};

export function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [fiverrOrderId, setFiverrOrderId] = useState("");
  const [status, setStatus] = useState("PLANNING");
  const [notes, setNotes] = useState("");

  function renameFile(file: File, newName: string) {
    return new File([file], newName, { type: file.type });
  }

  function deduplicateFiles(incoming: File[], existing: PendingFile[]): File[] {
    const taken = new Set(existing.map((pf) => pf.file.name));
    return incoming.map((f) => {
      if (!taken.has(f.name)) {
        taken.add(f.name);
        return f;
      }
      const dot = f.name.lastIndexOf(".");
      const base = dot > 0 ? f.name.slice(0, dot) : f.name;
      const ext = dot > 0 ? f.name.slice(dot) : "";
      const unique = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
      taken.add(unique);
      return renameFile(f, unique);
    });
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Uses uploadFile utility (supports large files via R2 presign) ──────────
  const uploadSingleFile = async (file: File): Promise<PendingFile> => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const pendingFile: PendingFile = {
      file,
      id,
      status: "uploading",
      progress: 0,
    };

    setPendingFiles((prev) => [...prev, pendingFile]);

    try {
      setPendingFiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, progress: 10 } : p)),
      );

      // uploadFileFn auto-picks Cloudinary (<4 MB) or R2 presigned (≥4 MB)
      const data = await uploadFileFn(file, (pct) => {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, progress: pct } : p)),
        );
      });

      const uploadedData: UploadedFile = {
        url: data.url,
        public_id: data.public_id,
        name: file.name,
        resource_type: data.resource_type,
        size: data.size,
      };

      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: "uploaded", progress: 100, uploadedData }
            : p,
        ),
      );

      return {
        ...pendingFile,
        status: "uploaded",
        progress: 100,
        uploadedData,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "error", progress: 0, error: msg } : p,
        ),
      );
      toast.error(`Failed to upload ${file.name}`, { description: msg });
      throw err;
    }
  };

  const addFiles = (incoming: File[]) => {
    const deduplicated = deduplicateFiles(incoming, pendingFiles);

    if (deduplicated.length === 0) {
      toast.error("File(s) already added");
      return;
    }

    deduplicated.forEach((file, idx) => {
      setTimeout(() => {
        uploadSingleFile(file).catch(() => {});
      }, idx * 100);
    });

    toast.success(
      `Uploading ${deduplicated.length} file${deduplicated.length > 1 ? "s" : ""}...`,
    );
  };

  const removeFile = async (id: string): Promise<void> => {
    const pending = pendingFiles.find((p) => p.id === id);

    // Remove from UI first (optimistic update)
    setPendingFiles((prev) => prev.filter((p) => p.id !== id));

    // If already uploaded, delete from storage (non-blocking)
    if (pending?.status === "uploaded" && pending.uploadedData?.public_id) {
      try {
        await deleteFile({
          public_id: pending.uploadedData.public_id,
          resource_type: pending.uploadedData.resource_type,
          // Cast to access optional storage property if your UploadResult includes it
          storage: pending.uploadedData.storage, // ← No more 'as any'
          url: pending.uploadedData.url,
        });
        toast.success(`Removed ${pending.file.name}`);
      } catch (err) {
        console.warn(
          "Failed to delete file from storage:",
          pending.uploadedData.public_id,
        );
        // Don't revert UI — storage cleanup is best-effort for pending files
        toast.error(`Could not delete ${pending.file.name} from storage`, {
          description: "File removed from form but may still exist in storage",
        });
      }
    }
  };

  function resetForm() {
    setName("");
    setClientName("");
    setWebsiteUrl("");
    setFiverrOrderId("");
    setStatus("PLANNING");
    setNotes("");
    setPendingFiles([]);
    setIsDraggingOver(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const hasUploading = pendingFiles.some((p) => p.status === "uploading");
    if (hasUploading) {
      toast.error("Please wait for files to finish uploading.");
      return;
    }

    const hasErrors = pendingFiles.some((p) => p.status === "error");
    if (hasErrors) {
      toast.error(
        "Some files failed to upload. Please remove them or try again.",
      );
      return;
    }

    setLoading(true);

    try {
      const uploadedFilesData = pendingFiles
        .filter((p) => p.status === "uploaded" && p.uploadedData)
        .map((p) => p.uploadedData!);

      const parsed = createProjectSchema.safeParse({
        name,
        client_name: clientName || undefined,
        website_url: websiteUrl || undefined,
        fiverr_order_id: fiverrOrderId || undefined,
        status,
        body: notes || undefined,
      });

      if (!parsed.success) {
        toast.error("Validation Error", {
          description: parsed.error.issues[0].message,
        });
        setLoading(false);
        return;
      }

      const body: Record<string, unknown> = { ...parsed.data };
      if (uploadedFilesData.length > 0) {
        body.files = JSON.stringify(uploadedFilesData);
      }

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Something went wrong");
      }

      toast.success("Project created", {
        description: "Your project was successfully created.",
      });
      projectEvents.triggerProjectCreated();

      setOpen(false);
      resetForm();
      router.refresh();
    } catch (err: unknown) {
      toast.error("Error creating project", {
        description: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  }

  const hasUploadingFiles = pendingFiles.some((p) => p.status === "uploading");
  const canSubmit = !hasUploadingFiles && !loading;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>Create Project</Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Core fields */}
          <div className="space-y-2">
            <Label>
              Project Name <span className="text-destructive">*</span>
            </Label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp Redesign"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Client Name
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. John Smith"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <IconWorld className="h-3.5 w-3.5 text-muted-foreground" />
              Website URL
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <Input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              type="url"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Fiverr Order ID
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <Input
              value={fiverrOrderId}
              onChange={(e) => setFiverrOrderId(e.target.value)}
              placeholder="FO-XXXXXX"
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PLANNING">Planning</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="IN_QA">In QA</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Attachments with Eager Upload UI */}
          <div className="space-y-2">
            <Label>
              Attachments
              {pendingFiles.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""}
                </span>
              )}
            </Label>

            <div
              className={`border-2 border-dashed rounded-lg p-5 transition-colors outline-none ${
                isDraggingOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node))
                  setIsDraggingOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length) addFiles(dropped);
              }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files);
                if (pasted.length) addFiles(pasted);
              }}
              tabIndex={0}
            >
              <input
                type="file"
                multiple
                id="project-files"
                className="hidden"
                accept="*/*"
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="project-files"
                className="flex flex-col items-center gap-2 cursor-pointer select-none"
              >
                <IconUpload className="h-7 w-7 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Drop files, paste, or{" "}
                    <span className="text-primary underline">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Files start uploading immediately
                  </p>
                </div>
              </label>
            </div>

            {/* Pending files with upload status */}
            {pendingFiles.length > 0 && (
              <div className="space-y-1.5">
                {pendingFiles.map((pf) => {
                  const isImage = pf.file.type.startsWith("image/");

                  return (
                    <div
                      key={pf.id}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                        pf.status === "error"
                          ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
                          : pf.status === "uploaded"
                            ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                            : "bg-muted border-transparent"
                      }`}
                    >
                      {/* Thumbnail or Icon with status overlay */}
                      <div className="relative h-9 w-9 shrink-0 rounded overflow-hidden border bg-muted flex items-center justify-center">
                        {isImage && pf.status !== "error" ? (
                          <img
                            src={URL.createObjectURL(pf.file)}
                            alt={pf.file.name}
                            className="h-full w-full object-cover opacity-80"
                          />
                        ) : (
                          <IconPaperclip className="h-4 w-4 text-muted-foreground" />
                        )}

                        {/* Status Overlay Icon */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded">
                          {pf.status === "uploading" && (
                            <IconLoader className="h-4 w-4 text-white animate-spin" />
                          )}
                          {pf.status === "uploaded" && (
                            <IconCheck className="h-4 w-4 text-green-400" />
                          )}
                          {pf.status === "error" && (
                            <IconAlertCircle className="h-4 w-4 text-red-400" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate max-w-[200px]">
                          {pf.file.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            {formatSize(pf.file.size)}
                          </span>

                          {pf.status === "uploading" && (
                            <span className="text-[10px] text-blue-600 font-medium">
                              Uploading...
                            </span>
                          )}
                          {pf.status === "uploaded" && (
                            <span className="text-[10px] text-green-600 font-medium">
                              Ready
                            </span>
                          )}
                          {pf.status === "error" && (
                            <span
                              className="text-[10px] text-red-600 font-medium truncate max-w-[150px]"
                              title={pf.error}
                            >
                              Failed
                            </span>
                          )}
                        </div>

                        {/* Progress Bar */}
                        {pf.status === "uploading" && (
                          <Progress value={pf.progress} className="h-1 mt-1" />
                        )}
                      </div>

                      {/* Remove Button */}
                      {!loading && (
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => removeFile(pf.id)}
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes / Body */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <IconAlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
              Notes
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                optional
              </span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes or details about this project…"
              className="resize-none min-h-[100px]"
            />
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {loading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creating…
              </>
            ) : hasUploadingFiles ? (
              <>
                <IconLoader className="mr-2 h-4 w-4 animate-spin" />
                Waiting for uploads...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </form>
        <ProjectImportButton />
      </DialogContent>
    </Dialog>
  );
}
