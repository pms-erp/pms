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
  IconCalendar,
  IconLoader,
  IconCheck,
  IconAlertCircle,
  IconSearch,
  IconChevronDown,
} from "@tabler/icons-react";
import Link from "next/link";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { uploadFile, deleteFile } from "@/lib/upload-file";

type TeamOption = {
  id: string;
  name: string;
  slug: string;
};

type Project = {
  id: string;
  name: string;
};

type TeamMember = {
  id: string;
  name: string;
  username: string;
  role?: string;
  is_active?: boolean;
};

type PendingFile = {
  file: File;
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  url?: string;
  public_id?: string;
  resource_type?: string;
  storage?: "cloudinary" | "r2";
  size?: number;
  error?: string;
};

type FormDataState = {
  project_id: string;
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
  const takenNames = new Set(existing.map((pf) => pf.file.name));
  return incoming.map((f) => {
    if (!takenNames.has(f.name)) {
      takenNames.add(f.name);
      return f;
    }
    const dot = f.name.lastIndexOf(".");
    const base = dot > 0 ? f.name.slice(0, dot) : f.name;
    const ext = dot > 0 ? f.name.slice(dot) : "";
    const unique = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
    takenNames.add(unique);
    return renameFile(f, unique);
  });
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function CreateTaskDialog({
  onTaskCreated,
}: {
  onTaskCreated?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [fetchingData, setFetchingData] = useState<boolean>(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // ✅ Search state for Project dropdown
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // ✅ Search state for Assign To dropdown
  const [assignSearch, setAssignSearch] = useState("");
  const [assignDropdownOpen, setAssignDropdownOpen] = useState(false);
  const assignDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<FormDataState>({
    project_id: "",
    team_type: "",
    title: "",
    description: "",
    priority: "MEDIUM",
    assigned_to: "",
    due_date: null,
  });

  // ✅ Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        projectDropdownRef.current &&
        !projectDropdownRef.current.contains(event.target as Node)
      ) {
        setProjectDropdownOpen(false);
      }
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

  // ✅ Filter projects based on search
  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()),
  );

  // ✅ Get selected project display text
  const selectedProject = projects.find((p) => p.id === formData.project_id);

  // ✅ Filter team members based on search
  const filteredTeamMembers = teamMembers.filter((m) => {
    const searchLower = assignSearch.toLowerCase();
    return (
      m.name.toLowerCase().includes(searchLower) ||
      m.username.toLowerCase().includes(searchLower)
    );
  });

  // ✅ Get selected member display text
  const selectedMember = teamMembers.find((m) => m.id === formData.assigned_to);

  useEffect(() => {
    if (open) {
      fetchProjects();
      fetchTeamMembers();
      fetchTeamOptions();
    } else {
      // When dialog closes, delete any already-uploaded files that were never submitted
      setPendingFiles((prev) => {
        prev
          .filter((p) => p.status === "uploaded" && p.public_id)
          .forEach((p) => {
            deleteFile({
              public_id: p.public_id!,
              resource_type: p.resource_type,
              storage: p.storage,
              url: p.url,
            }).catch((err) =>
              console.warn("Storage cleanup failed for:", p.public_id, err),
            );
          });
        return [];
      });
      setFormData({
        project_id: "",
        team_type: "",
        title: "",
        description: "",
        priority: "MEDIUM",
        assigned_to: "",
        due_date: null,
      });
      setProjectSearch("");
      setProjectDropdownOpen(false);
      setAssignSearch("");
      setAssignDropdownOpen(false);
    }
  }, [open]);

  // ── Eager upload ──────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    setPendingFiles((prev) => [
      ...prev,
      { file, id, status: "uploading", progress: 0 },
    ]);

    try {
      const data = await uploadFile(file, (progress) => {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, progress } : p)),
        );
      });

      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "uploaded",
                progress: 100,
                url: data.url,
                public_id: data.public_id,
                resource_type: data.resource_type,
                storage: data.storage,
                size: data.size,
              }
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
    if (deduplicated.length === 0) return;
    deduplicated.forEach((file) => handleUpload(file));
  };

  // ── Remove file: if already uploaded, delete from storage first ───────────
  const removeFile = (id: string) => {
    setPendingFiles((prev) => {
      const file = prev.find((p) => p.id === id);

      // Fire-and-forget storage delete for successfully uploaded files
      if (file?.status === "uploaded" && file.public_id) {
        deleteFile({
          public_id: file.public_id,
          resource_type: file.resource_type,
          storage: file.storage,
          url: file.url,
        }).catch((err) =>
          console.warn("Storage delete failed for:", file.public_id, err),
        );
      }

      return prev.filter((p) => p.id !== id);
    });
  };

  async function fetchProjects() {
    setFetchingData(true);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
      const data = await res.json();
      const projectsList: Project[] =
        data.data || data.projects || data.allProjects || [];
      setProjects(projectsList);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setFetchingData(false);
    }
  }

  async function fetchTeamMembers() {
    try {
      const res = await fetch("/api/users?for=assignment&limit=200");
      if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.users) ? data.users : [];

      // Filter out:
      // 1. Users with CLIENT or CUSTOMER role
      // 2. Users who are inactive (is_active === false)
      const filteredList = list.filter((user: TeamMember) => {
        const role = user.role?.toUpperCase();
        const isClient = role === "CLIENT" || role === "CUSTOMER";
        const isActive = user.is_active !== false;
        return !isClient && isActive;
      });

      setTeamMembers(filteredList);
    } catch (error) {
      console.error("Failed to fetch team members:", error);
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
        .filter((p) => p.status === "uploaded")
        .map((p) => ({
          url: p.url!,
          public_id: p.public_id!,
          name: p.file.name,
          resource_type: p.resource_type!,
          storage: p.storage,
          size: p.size!,
        }));

      const parsed = createTaskSchema.safeParse({
        ...formData,
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
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "An unknown error occurred";
      toast.error("Failed to create task", { description: message });
    } finally {
      setLoading(false);
    }
  }

  const isUploading = pendingFiles.some((p) => p.status === "uploading");
  const canSubmit = !isUploading && !loading;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create Task</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ✅ Project - Searchable Dropdown */}
          <div className="space-y-2" ref={projectDropdownRef}>
            <Label>
              Project <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
                disabled={fetchingData}
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={selectedProject ? "" : "text-muted-foreground"}
                >
                  {fetchingData
                    ? "Loading…"
                    : selectedProject
                      ? selectedProject.name
                      : projects.length === 0
                        ? "No projects available"
                        : "Search and select a project"}
                </span>
                <IconChevronDown className="h-4 w-4 opacity-50" />
              </button>

              {projectDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                  {/* Search Input */}
                  <div className="flex items-center border-b px-3">
                    <IconSearch className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      type="text"
                      placeholder="Search projects…"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="flex h-9 w-full rounded-md bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      autoFocus
                    />
                    {projectSearch && (
                      <button
                        type="button"
                        onClick={() => setProjectSearch("")}
                        className="ml-2 rounded-sm opacity-70 hover:opacity-100"
                      >
                        <IconX className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {filteredProjects.length === 0 ? (
                      <div className="py-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          No projects found.
                        </p>
                        {!projectSearch && !fetchingData && (
                          <Link
                            href="/projects"
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            Create one
                          </Link>
                        )}
                      </div>
                    ) : (
                      filteredProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, project_id: p.id });
                            setProjectDropdownOpen(false);
                            setProjectSearch("");
                          }}
                          className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                            formData.project_id === p.id
                              ? "bg-accent text-accent-foreground"
                              : ""
                          }`}
                        >
                          <IconCheck
                            className={`mr-2 h-4 w-4 ${
                              formData.project_id === p.id
                                ? "opacity-100"
                                : "opacity-0"
                            }`}
                          />
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Team Type */}
          <div className="space-y-2">
            <Label>
              Team Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.team_type}
              onValueChange={(value) =>
                setFormData({ ...formData, team_type: value })
              }
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
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  priority: value as "LOW" | "MEDIUM" | "HIGH",
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

          {/* ✅ Assign To - Searchable Dropdown */}
          <div className="space-y-2" ref={assignDropdownRef}>
            <Label>
              Assign To <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAssignDropdownOpen(!assignDropdownOpen)}
                disabled={fetchingData}
                className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={selectedMember ? "" : "text-muted-foreground"}>
                  {fetchingData
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
              className={`border-2 border-dashed rounded-lg p-6 transition-colors outline-none ${
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
                if (dropped.length > 0) addFiles(dropped);
              }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files);
                if (pasted.length > 0) addFiles(pasted);
              }}
              tabIndex={0}
            >
              <Input
                type="file"
                multiple
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
                className="hidden"
                id="task-files"
                accept="*/*"
              />
              <Label
                htmlFor="task-files"
                className="flex flex-col items-center justify-center cursor-pointer gap-2 select-none"
              >
                <IconUpload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Drop files here, paste, or{" "}
                    <span className="text-primary underline">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Files start uploading immediately
                  </p>
                </div>
              </Label>
            </div>

            {pendingFiles.length > 0 && (
              <div className="space-y-1.5 mt-2">
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
                      {/* Thumbnail or Icon */}
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFile(pf.id)}
                        >
                          <IconX className="h-3.5 w-3.5" />
                        </Button>
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
            ) : isUploading ? (
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
