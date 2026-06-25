"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createTaskSchema } from "@/lib/tasks/validation";
import { Progress } from "@/components/ui/progress";
import {
  IconUpload,
  IconX,
  IconPaperclip,
  IconPlus,
  IconCalendar,
  IconLoader,
  IconCheck,
  IconAlertCircle,
  IconSearch,
  IconChevronDown,
} from "@tabler/icons-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { uploadFile as uploadFileFn, deleteFile } from "@/lib/upload-file";

type TeamOption = {
  id: string;
  name: string;
  slug: string;
};

// ✅ Added is_active field to TeamMember type
type TeamMember = {
  id: string;
  name: string;
  username: string;
  role?: string;
  is_active?: boolean;
};

type UploadedFile = {
  url: string;
  public_id: string;
  name: string;
  resource_type: string;
  storage?: "cloudinary" | "r2";
  size: number;
};

type PendingFile = {
  file: File;
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  uploadedData?: UploadedFile;
  error?: string;
};

type FormDataState = {
  team_type: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  assigned_to: string;
  due_date: Date | null;
};

function renameFile(file: File, newName: string): File {
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

interface CreateProjectTaskDialogProps {
  projectId: string;
  projectName?: string;
  onTaskCreated?: () => void;
}

export function CreateProjectTaskDialog({
  projectId,
  projectName,
  onTaskCreated,
}: CreateProjectTaskDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [fetchingMembers, setFetchingMembers] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Search state for assign to dropdown
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<FormDataState>({
    team_type: "",
    title: "",
    description: "",
    priority: "MEDIUM",
    assigned_to: "",
    due_date: null,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        assignDropdownRef.current &&
        !assignDropdownRef.current.contains(event.target as Node)
      ) {
        setAssignDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter team members based on search
  const filteredTeamMembers = teamMembers.filter((m) => {
    const searchLower = assignSearch.toLowerCase();
    return (
      m.name.toLowerCase().includes(searchLower) ||
      m.username.toLowerCase().includes(searchLower)
    );
  });

  // Get selected member display text
  const selectedMember = teamMembers.find((m) => m.id === formData.assigned_to);

  useEffect(() => {
    if (open) {
      fetchTeamMembers();
      fetchTeamOptions();
    } else {
      setPendingFiles((prev) => {
        prev
          .filter((p) => p.status === "uploaded" && p.uploadedData?.public_id)
          .forEach((p) => {
            deleteFile({
              public_id: p.uploadedData!.public_id,
              resource_type: p.uploadedData!.resource_type,
              storage: p.uploadedData!.storage,
              url: p.uploadedData!.url,
            }).catch((err) =>
              console.warn(
                "Storage cleanup failed for:",
                p.uploadedData!.public_id,
                err,
              ),
            );
          });
        return [];
      });
      setFormData({
        team_type: "",
        title: "",
        description: "",
        priority: "MEDIUM",
        assigned_to: "",
        due_date: null,
      });
      setAssignSearch("");
      setAssignDropdownOpen(false);
      setIsDraggingOver(false);
    }
  }, [open]);

  const uploadSingleFile = async (file: File): Promise<void> => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    setPendingFiles((prev) => [
      ...prev,
      { file, id, status: "uploading", progress: 0 },
    ]);

    try {
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
        storage: data.storage,
        size: data.size,
      };

      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: "uploaded", progress: 100, uploadedData }
            : p,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "error", progress: 0, error: msg } : p,
        ),
      );
      toast.error(`Failed to upload ${file.name}`, { description: msg });
    }
  };

  const addFiles = (incoming: File[]) => {
    const deduplicated = deduplicateFiles(incoming, pendingFiles);
    if (deduplicated.length === 0) {
      toast.error("File(s) already added");
      return;
    }
    deduplicated.forEach((file, idx) => {
      setTimeout(() => uploadSingleFile(file), idx * 100);
    });
    toast.success(
      `Uploading ${deduplicated.length} file${deduplicated.length > 1 ? "s" : ""}...`,
    );
  };

  const removeFile = (id: string) => {
    setPendingFiles((prev) => {
      const file = prev.find((p) => p.id === id);

      if (file?.status === "uploaded" && file.uploadedData?.public_id) {
        deleteFile({
          public_id: file.uploadedData.public_id,
          resource_type: file.uploadedData.resource_type,
          storage: file.uploadedData.storage,
          url: file.uploadedData.url,
        }).catch((err) =>
          console.warn(
            "Storage delete failed for:",
            file.uploadedData!.public_id,
            err,
          ),
        );
      }

      return prev.filter((p) => p.id !== id);
    });
  };

  // ✅ Updated fetchTeamMembers to filter out CLIENT users AND inactive users
  async function fetchTeamMembers() {
    setFetchingMembers(true);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = data.data || data.users || data.allUsers || data || [];

      // Filter out:
      // 1. Users with CLIENT or CUSTOMER role
      // 2. Users who are inactive (is_active === false)
      const filteredList = Array.isArray(list)
        ? list.filter((user: TeamMember) => {
            const role = user.role?.toUpperCase();
            const isClient = role === "CLIENT" || role === "CUSTOMER";
            const isActive = user.is_active !== false; // default to true if undefined
            return !isClient && isActive;
          })
        : [];

      setTeamMembers(filteredList);
    } catch {
      toast.error("Failed to load team members");
    } finally {
      setFetchingMembers(false);
    }
  }

  async function fetchTeamOptions() {
    try {
      const res = await fetch("/api/teams");
      if (!res.ok) return;
      const data = await res.json();
      setTeamOptions(Array.isArray(data) ? data : []);
    } catch {
      console.error("Failed to fetch teams");
    }
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

      const parsed = createTaskSchema.safeParse({
        ...formData,
        project_id: projectId,
        estimated_minutes: formData.due_date
          ? Math.max(
              1,
              Math.round((formData.due_date.getTime() - Date.now()) / 60000),
            )
          : undefined,
        due_date: formData.due_date
          ? formData.due_date.toISOString()
          : undefined,
      });

      if (!parsed.success) {
        toast.error("Validation Error", {
          description: parsed.error.issues[0].message,
        });
        setLoading(false);
        return;
      }

      const requestBody: Record<string, unknown> = { ...parsed.data };
      if (uploadedFilesData.length > 0) {
        requestBody.files = JSON.stringify(uploadedFilesData);
      }

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast.success("Task created successfully");
      setPendingFiles([]);
      setOpen(false);
      router.refresh();
      onTaskCreated?.();
    } catch (err) {
      toast.error("Failed to create task", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  const hasUploadingFiles = pendingFiles.some((p) => p.status === "uploading");
  const canSubmit = !hasUploadingFiles && !loading;

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <IconPlus className="h-4 w-4" />
          Add Task
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Task
            {projectName && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                in {projectName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Team Type */}
          <div className="space-y-2">
            <Label>
              Team Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.team_type}
              onValueChange={(v) => setFormData({ ...formData, team_type: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select team type" />
              </SelectTrigger>
              <SelectContent>
                {teamOptions.map((t) => (
                  <SelectItem key={t.id} value={t.slug}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Enter task title"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Enter task description"
              rows={3}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label>
              Priority <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.priority}
              onValueChange={(v) =>
                setFormData({
                  ...formData,
                  priority: v as "LOW" | "MEDIUM" | "HIGH",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Deadline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <IconCalendar className="h-3.5 w-3.5 text-muted-foreground" />
                Deadline
              </Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <DateTimePicker
              value={formData.due_date}
              onChange={(date) => setFormData({ ...formData, due_date: date })}
              placeholder="Pick a deadline date & time"
            />
            {formData.due_date && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {Math.max(
                    0,
                    Math.round(
                      (formData.due_date.getTime() - Date.now()) /
                        (1000 * 60 * 60),
                    ),
                  )}{" "}
                  hours from now
                </p>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, due_date: null })}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Assign To - Searchable Dropdown */}
          <div className="space-y-2" ref={assignDropdownRef}>
            <Label>
              Assign To <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}
                disabled={fetchingMembers}
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={selectedMember ? "" : "text-muted-foreground"}>
                  {fetchingMembers
                    ? "Loading…"
                    : selectedMember
                      ? `${selectedMember.name} (@${selectedMember.username})`
                      : "Search and select team member"}
                </span>
                <IconChevronDown className="h-4 w-4 opacity-50" />
              </button>

              {assignDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                  {/* Search Input */}
                  <div className="flex items-center border-b px-3">
                    <IconSearch className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      type="text"
                      placeholder="Search by name or username…"
                      value={assignSearch}
                      onChange={(e) => setAssignSearch(e.target.value)}
                      className="flex h-9 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      autoFocus
                    />
                    {assignSearch && (
                      <button
                        type="button"
                        onClick={() => setAssignSearch("")}
                        className="ml-2 rounded-sm opacity-70 hover:opacity-100"
                      >
                        <IconX className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {filteredTeamMembers.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No team members found.
                      </p>
                    ) : (
                      filteredTeamMembers.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, assigned_to: m.id });
                            setAssignDropdownOpen(false);
                            setAssignSearch("");
                          }}
                          className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                            formData.assigned_to === m.id
                              ? "bg-accent text-accent-foreground"
                              : ""
                          }`}
                        >
                          <IconCheck
                            className={`mr-2 h-4 w-4 ${
                              formData.assigned_to === m.id
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          {m.name} (@{m.username})
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Attachments */}
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
                id="project-task-files"
                className="hidden"
                accept="*/*"
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="project-task-files"
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
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
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
                        {pf.status === "uploading" && (
                          <Progress value={pf.progress} className="h-1 mt-1" />
                        )}
                      </div>

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

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {loading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Creating task…
              </>
            ) : hasUploadingFiles ? (
              <>
                <IconLoader className="mr-2 h-4 w-4 animate-spin" />
                Waiting for uploads...
              </>
            ) : (
              "Create Task"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
