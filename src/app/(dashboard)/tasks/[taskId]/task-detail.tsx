"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconDotsVertical,
  IconEdit,
  IconUser,
  IconClock,
  IconCalendar,
  IconPaperclip,
  IconDownload,
  IconRefresh,
  IconX,
  IconUpload,
  IconCheck,
  IconTrash,
  IconPlus,
  IconShieldCheck,
  IconAlertTriangle,
  IconUserCheck,
  IconLoader,
  IconAlertCircle,
  IconEye,
  IconList,
} from "@tabler/icons-react";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { TaskTimer } from "./task-timer";
import { HelpRequestButton } from "./help-request-button";
import { TaskComments } from "./task-comments";
import {
  QAReviewInline,
  ImageGalleryGrid,
  ImageLightbox,
} from "../_components/qa-review-dialog";
import {
  taskEvents,
  notificationEvents,
  Task as TaskEvent,
} from "@/lib/events";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import RichTextEditor from "@/components/rich-text-editor";
import { uploadFile, deleteFile, type UploadResult } from "@/lib/upload-file";
import { useTaskRealtime } from "@/hooks/use-task-realtime";

// ─── TYPE DEFINITIONS ─────────────────────────────────────────────────────────

export interface TaskFile {
  url: string;
  public_id: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
  storage?: "cloudinary" | "r2";
}

export interface TeamMember {
  id: string;
  name: string;
  username: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface TeamOption {
  id: string;
  name: string;
  slug: string;
}

export interface TaskData {
  id: string;
  project_id: string;
  projectName?: string;
  team_type: "DEVELOPER" | "DESIGNER" | "PROGRAMMER" | string;
  title: string;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | string;
  status: "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK" | string;
  assigned_to?: string;
  assignedUserName?: string;
  assignedByUsername?: string;
  assignedUserAvatar?: string | null;
  qa_assigned_to?: string | null;
  qaAssignedUserName?: string | null;
  qaAssignedUserAvatar?: string | null;
  estimated_minutes?: number | null;
  files?: string;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  started_at?: string | Date | null;
  rework_count?: number;
}

// ── NEW: Related Task Interface ─────────────────────────────────────────────
export interface RelatedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  team_type: string;
  assigned_to?: string;
  assignedUserName?: string;
  assignedUserAvatar?: string | null;
  created_at?: string | Date | null;
}

interface TaskDetailProps {
  task: TaskData;
  userRole: string;
  userId: string;
  userName: string;
  relatedTasks?: RelatedTask[]; // ← NEW: Optional prop for related tasks
}

const PRIVILEGED_ROLES = ["TEAM_LEADER", "ADMIN", "PROJECT_MANAGER"];
const VIEWABLE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|webm|mov)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;

function parseFiles(filesJson: string | undefined): TaskFile[] {
  if (!filesJson) return [];
  try {
    const parsed: unknown = JSON.parse(filesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((f: unknown) => {
      if (typeof f === "string") return { url: f, public_id: "" };
      const file = f as TaskFile;
      return {
        url: file.url ?? "",
        public_id: file.public_id ?? "",
        name: file.name,
        original_name: file.original_name,
        resource_type: file.resource_type,
        size: file.size,
        storage: file.storage,
      };
    });
  } catch {
    return [];
  }
}

// Helper: detect storage from URL pattern
function detectStorageFromFile(url?: string): "cloudinary" | "r2" | undefined {
  if (!url) return undefined;
  if (url.includes("res.cloudinary.com")) return "cloudinary";
  if (
    url.includes(
      process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "r2.cloudflarestorage.com",
    )
  )
    return "r2";
  if (url.includes("/")) return "r2";
  return "cloudinary";
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export function TaskDetail({
  task,
  userRole,
  userId,
  userName,
  relatedTasks = [], // ← NEW: Default to empty array
}: TaskDetailProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timeExceededSentRef = useRef(false);

  const [localTask, setLocalTask] = useState<TaskData>(task);
  const [localFiles, setLocalFiles] = useState<TaskFile[]>(
    parseFiles(task.files),
  );

  // inline edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description ?? "");
  const [savingField, setSavingField] = useState<
    "title" | "description" | null
  >(null);

  // dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [previewFiles, setPreviewFiles] = useState<{
    files: TaskFile[];
    index: number;
  } | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [completing, setCompleting] = useState(false);

  // QA Assignment States
  const [qaDialogOpen, setQaDialogOpen] = useState(false);
  const [qaUsers, setQaUsers] = useState<TeamMember[]>([]);
  const [selectedQaUser, setSelectedQaUser] = useState("");
  const [assigningQA, setAssigningQA] = useState(false);
  const [loadingQaUsers, setLoadingQaUsers] = useState(false);

  const [timerStopped, setTimerStopped] = useState(
    task.status === "WAITING_FOR_QA" || task.status === "APPROVED",
  );

  const localTaskRef = useRef<TaskData>(task);
  useEffect(() => {
    localTaskRef.current = localTask;
  }, [localTask]);

  // ── Scroll to top on mount ───────────────────────────────────────────────
  useEffect(() => {
    const main = document.querySelector("main");
    if (main) {
      main.scrollTop = 0;
    } else {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
    }
  }, []);

  // ── Real-time task updates via SSE ───────────────────────────────────────
  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${task.id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { task?: TaskData } | TaskData;
      const updated = (data as { task?: TaskData }).task ?? (data as TaskData);
      if (updated?.id) setLocalTask(updated);
    } catch {
      /* silently ignore */
    }
  }, [task.id]);

  useTaskRealtime(task.id, {
    onTaskUpdate: () => void refetch(),
    onCommentUpdate: () => void refetch(),
  });

  useEffect(() => {
    const unsub = taskEvents.onTaskUpdated((updated) => {
      if (updated.id === task.id) setLocalTask(updated as unknown as TaskData);
    });
    return () => unsub();
  }, [task.id, refetch]);

  useEffect(() => {
    const onFocus = () => void refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  useEffect(() => {
    const shouldStop =
      localTask.status === "WAITING_FOR_QA" || localTask.status === "APPROVED";
    setTimerStopped(shouldStop);
  }, [localTask.status]);

  const canManageTask = PRIVILEGED_ROLES.includes(userRole);
  const isQAAssignedToThisTask =
    userRole === "QA" && localTask.qa_assigned_to === userId;
  const canSeeQAFeedback =
    canManageTask || userId === localTask.assigned_to || userRole === "QA";

  // ─── Color helpers ────────────────────────────────────────────────────────
  const getPriorityColor = (p: string): string => {
    const m: Record<string, string> = {
      HIGH: "bg-red-100 text-red-700 border-red-200",
      MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
      LOW: "bg-green-100 text-green-700 border-green-200",
    };
    return m[p] ?? "bg-gray-100 text-gray-700 border-gray-200";
  };

  const getStatusColor = (s: string): string => {
    const m: Record<string, string> = {
      IN_PROGRESS: "bg-orange-100 text-orange-700 border-orange-200",
      WAITING_FOR_QA: "bg-purple-100 text-purple-700 border-purple-200",
      APPROVED: "bg-green-100 text-green-700 border-green-200",
      REWORK: "bg-red-100 text-red-700 border-red-200",
    };
    return m[s] ?? "bg-gray-100 text-gray-700 border-gray-200";
  };

  const getTeamTypeColor = (t: string): string => {
    const m: Record<string, string> = {
      DEVELOPER: "bg-blue-100 text-blue-700 border-blue-200",
      DESIGNER: "bg-pink-100 text-pink-700 border-pink-200",
      PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
    };
    return m[t] ?? "bg-gray-100 text-gray-700 border-gray-200";
  };

  const formatTime = (minutes: number | null | undefined): string => {
    if (!minutes) return "Not set";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "Not set";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getFileType = (url: string): string => {
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return "image";
    if (url.match(/\.(pdf|doc|docx|txt)$/i)) return "document";
    if (url.match(/\.(mp4|webm|mov|avi|mkv)$/i)) return "video";
    return "other";
  };

  const getFileIcon = (type: string): string =>
    ({ image: "🖼️", video: "🎬", document: "📄" })[type] ?? "📎";

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // ─── Patch ────────────────────────────────────────────────────────────────
  const patchTask = async (
    body: Record<string, string | number | null>,
  ): Promise<void> => {
    const res = await fetch(`/api/tasks/${localTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update");
    const data = (await res.json()) as { task: TaskData };
    setLocalTask((prev) => ({ ...prev, ...data.task }));
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDeleteTask = async (): Promise<void> => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${localTask.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to delete");
      }
      toast.success("Task deleted successfully");
      setDeleteOpen(false);
      router.push("/tasks");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Time exceeded ────────────────────────────────────────────────────────
  const handleTimeExceeded = useCallback(async (): Promise<void> => {
    if (timeExceededSentRef.current) return;
    timeExceededSentRef.current = true;
    const currentTask = localTaskRef.current;
    try {
      const [admins, pms, tls] = await Promise.all([
        fetch("/api/users?role=ADMIN&limit=100").then((r) => r.json()),
        fetch("/api/users?role=PROJECT_MANAGER&limit=100").then((r) =>
          r.json(),
        ),
        fetch("/api/users?role=TEAM_LEADER&limit=100").then((r) => r.json()),
      ]);
      const toUserIds = (res: unknown): string[] => {
        const arr = Array.isArray(res)
          ? res
          : ((res as { data?: { id: string }[] })?.data ??
            (res as { users?: { id: string }[] })?.users ??
            []);
        return (arr as { id: string }[]).map((u) => u.id);
      };
      const privilegedIds = [
        ...new Set([
          ...toUserIds(admins),
          ...toUserIds(pms),
          ...toUserIds(tls),
        ]),
      ];
      const userIds = [...new Set([...privilegedIds, userId])];
      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds,
          pushUserIds: privilegedIds,
          taskId: currentTask.id,
          type: "TIME_EXCEEDED",
          title: `Time Exceeded: ${currentTask.title}`,
          message: `The estimated time for task "${currentTask.title}" assigned to ${currentTask.assignedUserName ?? "a user"} has been exceeded.`,
        }),
      });
      toast.warning("Estimated time exceeded — team has been notified", {
        duration: 6000,
      });
    } catch {
      console.error("Failed to send time exceeded notification");
    }
  }, []);

  // ─── Inline saves ─────────────────────────────────────────────────────────
  const saveTitle = async (): Promise<void> => {
    if (titleDraft === localTask.title) {
      setEditingTitle(false);
      return;
    }
    setSavingField("title");
    try {
      await patchTask({ title: titleDraft });
      setEditingTitle(false);
      toast.success("Title updated");
    } catch {
      toast.error("Failed to update title");
    } finally {
      setSavingField(null);
    }
  };

  const saveDescription = async (): Promise<void> => {
    if (descDraft === (localTask.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    setSavingField("description");
    try {
      await patchTask({ description: descDraft });
      setEditingDesc(false);
      toast.success("Description updated");
    } catch {
      toast.error("Failed to update description");
    } finally {
      setSavingField(null);
    }
  };

  // ─── File handlers ────────────────────────────────────────────────────────
  const triggerDownload = async (
    url: string,
    filename: string,
  ): Promise<void> => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch file");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleFileRowClick = (file: TaskFile): void => {
    if (VIEWABLE_EXT.test(file.url))
      window.open(file.url, "_blank", "noopener,noreferrer");
    else
      triggerDownload(file.url, file.name ?? file.original_name ?? "download");
  };

  const handleRemoveFile = async (index: number): Promise<void> => {
    const fileToRemove = localFiles[index];
    const updated = localFiles.filter((_, i) => i !== index);

    try {
      await patchTask({ files: JSON.stringify(updated) });
      setLocalFiles(updated);

      if (fileToRemove?.public_id) {
        await deleteFile({
          public_id: fileToRemove.public_id,
          resource_type: fileToRemove.resource_type,
          storage:
            fileToRemove.storage ?? detectStorageFromFile(fileToRemove.url),
          url: fileToRemove.url,
        });
      }
      toast.success("File removed");
    } catch (err) {
      const reverted = [...localFiles];
      await patchTask({ files: JSON.stringify(reverted) });
      setLocalFiles(reverted);
      toast.error(err instanceof Error ? err.message : "Failed to remove file");
    }
  };

  const handleAddFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;

    setUploadingFiles(true);
    try {
      const uploaded: TaskFile[] = [];

      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const result: UploadResult = await uploadFile(file, (pct) => {
          if (pct === 100) {
            toast.info(`Uploaded ${file.name}`, { duration: 1500 });
          }
        });

        uploaded.push({
          url: result.url,
          public_id: result.public_id,
          name: result.name,
          original_name: result.original_name,
          resource_type: result.resource_type,
          size: result.size,
          storage: result.storage,
        });
      }

      const merged = [...localFiles, ...uploaded];
      await patchTask({ files: JSON.stringify(merged) });
      setLocalFiles(merged);
      toast.success(`${uploaded.length} file(s) added successfully`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ─── Reassign ─────────────────────────────────────────────────────────────
  const handleReassign = async (newAssigneeId: string): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${localTask.id}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_to: newAssigneeId }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to reassign");
      }
      toast.success("Task reassigned successfully");
      setReassignOpen(false);
      router.refresh();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reassign task",
      );
    } finally {
      setLoading(false);
    }
  };

  // ─── Complete task (assignee) ─────────────────────────────────────────────
  const handleCompleteTask = async (): Promise<void> => {
    setCompleting(true);
    const isRework = localTask.status === "REWORK";
    const snapshot = localTask;

    setLocalTask((prev) => ({ ...prev, status: "WAITING_FOR_QA" }));
    setTimerStopped(true);

    try {
      await patchTask({ status: "WAITING_FOR_QA" });

      const [admins, pms, tls] = await Promise.all([
        fetch("/api/users?role=ADMIN&limit=100").then((r) => r.json()),
        fetch("/api/users?role=PROJECT_MANAGER&limit=100").then((r) =>
          r.json(),
        ),
        fetch("/api/users?role=TEAM_LEADER&limit=100").then((r) => r.json()),
      ]);
      const toUserIds = (res: unknown): string[] => {
        const arr = Array.isArray(res)
          ? res
          : ((res as { data?: { id: string }[] })?.data ??
            (res as { users?: { id: string }[] })?.users ??
            []);
        return (arr as { id: string }[]).map((u) => u.id);
      };
      const privilegedIds = [
        ...new Set([
          ...toUserIds(admins),
          ...toUserIds(pms),
          ...toUserIds(tls),
        ]),
      ];
      const pushTargets = privilegedIds.length > 0 ? privilegedIds : [userId];

      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [...new Set([...pushTargets, userId])],
          pushUserIds: pushTargets,
          taskId: snapshot.id,
          type: isRework ? "TASK_RESUBMITTED" : "TASK_COMPLETED",
          title: isRework
            ? `Rework Complete: ${snapshot.title}`
            : `Task Completed: ${snapshot.title}`,
          message: isRework
            ? `${snapshot.assignedUserName ?? "The assignee"} has completed the rework for "${snapshot.title}" (Rework #${snapshot.rework_count ?? 1}). Automatically re-assigned to the same QA reviewer.`
            : `${snapshot.assignedUserName ?? "A team member"} has completed the task "${snapshot.title}" — it is now waiting for QA review.`,
        }),
      });

      toast.success(
        isRework
          ? "Rework submitted — managers notified to reassign QA"
          : "Task marked as complete — QA team has been notified",
      );
      taskEvents.triggerTaskUpdated({
        ...snapshot,
        status: "WAITING_FOR_QA",
      } as unknown as TaskEvent);
      notificationEvents.triggerNotificationReceived();
      router.refresh();
    } catch {
      setLocalTask(snapshot);
      setTimerStopped(false);
      toast.error("Failed to complete task");
    } finally {
      setCompleting(false);
    }
  };

  const fetchTeamMembers = async (): Promise<void> => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as
        | { data?: TeamMember[]; users?: TeamMember[]; allUsers?: TeamMember[] }
        | TeamMember[];
      const list = Array.isArray(data)
        ? data
        : (data.data ?? data.users ?? data.allUsers ?? []);
      setTeamMembers(list);
    } catch {
      toast.error("Failed to load team members");
    }
  };

  // ─── QA Assignment Logic ──────────────────────────────────────────────────
  const fetchQaUsers = async () => {
    setLoadingQaUsers(true);
    try {
      const res = await fetch("/api/users?role=QA");
      const d = await res.json();
      const list: TeamMember[] = Array.isArray(d)
        ? d
        : (d.data ?? d.users ?? []);
      setQaUsers(list);
    } catch {
      toast.error("Failed to load QA users");
    } finally {
      setLoadingQaUsers(false);
    }
  };

  const handleAssignQa = async () => {
    if (!selectedQaUser) return;
    setAssigningQA(true);
    try {
      const selectedQa = qaUsers.find((u) => u.id === selectedQaUser);

      await patchTask({
        qa_assigned_to: selectedQaUser,
        qa_assigned_at: new Date().toISOString(),
      });

      setLocalTask((prev) => ({
        ...prev,
        qa_assigned_to: selectedQaUser,
        qaAssignedUserName: selectedQa?.name ?? prev.qaAssignedUserName ?? null,
      }));

      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [selectedQaUser],
          pushUserIds: [selectedQaUser],
          taskId: localTask.id,
          type: "QA_REVIEWED",
          title: "Task Assigned for QA Review",
          message: `You have been assigned to review task: "${localTask.title}"`,
        }),
      });

      const user = qaUsers.find((u) => u.id === selectedQaUser);
      toast.success(`Assigned to ${user?.name ?? "QA"} for review`);
      setSelectedQaUser("");
      setQaDialogOpen(false);
      taskEvents.triggerTaskUpdated({
        ...localTask,
        qa_assigned_to: selectedQaUser,
        qaAssignedUserName: selectedQa?.name ?? localTask.qaAssignedUserName,
      } as unknown as TaskEvent);
      router.refresh();
    } catch (err) {
      toast.error("Failed to assign QA");
      console.error(err);
    } finally {
      setAssigningQA(false);
    }
  };

  const canMarkComplete =
    userId === localTask.assigned_to &&
    (localTask.status === "IN_PROGRESS" || localTask.status === "REWORK");

  const showAssignQaButton =
    canManageTask &&
    localTask.status === "WAITING_FOR_QA" &&
    !localTask.qa_assigned_to;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="md:p-6 p-3.5 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <IconArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") {
                      setTitleDraft(localTask.title);
                      setEditingTitle(false);
                    }
                  }}
                  className="text-2xl font-bold h-auto py-1 min-w-[300px]"
                  disabled={savingField === "title"}
                />
                <Button
                  size="sm"
                  onClick={saveTitle}
                  disabled={savingField === "title"}
                >
                  {savingField === "title" ? (
                    "..."
                  ) : (
                    <IconCheck className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTitleDraft(localTask.title);
                    setEditingTitle(false);
                  }}
                >
                  <IconX className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <h1
                className={`text-3xl font-bold tracking-tight flex items-center gap-2 ${canManageTask ? "cursor-pointer hover:underline decoration-dashed underline-offset-4" : ""}`}
                onClick={() => canManageTask && setEditingTitle(true)}
              >
                {localTask.title}
                {canManageTask && (
                  <IconEdit className="h-4 w-4 text-muted-foreground opacity-40" />
                )}
              </h1>
            )}
            {localTask.project_id && localTask.projectName ? (
              <Link
                href={`/projects/${localTask.project_id}`}
                className="text-muted-foreground mt-1 hover:text-foreground hover:underline underline-offset-4 transition-colors text-sm inline-block"
              >
                {localTask.projectName}
              </Link>
            ) : (
              <p className="text-muted-foreground mt-1">
                {localTask.projectName}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {userId === localTask.assigned_to && (
            <div className="flex items-center gap-2">
              <HelpRequestButton
                taskId={localTask.id}
                taskTitle={localTask.title}
                currentUserName={localTask.assignedUserName ?? "User"}
                currentUserId={userId}
              />
              {canMarkComplete && (
                <Button
                  size="sm"
                  className={`text-white gap-2 ${localTask.status === "REWORK" ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}`}
                  onClick={handleCompleteTask}
                  disabled={completing}
                >
                  {completing ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {localTask.status === "REWORK"
                        ? "Submitting…"
                        : "Completing…"}
                    </>
                  ) : (
                    <>
                      <IconCheck className="h-4 w-4" />
                      {localTask.status === "REWORK"
                        ? "Submit Rework"
                        : "Mark as Complete"}
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {canManageTask && (
            <div className="flex items-center gap-2">
              {showAssignQaButton && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-200 text-purple-600 hover:bg-purple-50"
                  onClick={() => {
                    setQaDialogOpen(true);
                    fetchQaUsers();
                  }}
                >
                  <IconUserCheck className="mr-2 h-4 w-4" />
                  Assign QA
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <IconDotsVertical className="h-4 w-4 mr-2" />
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <IconEdit className="mr-2 h-4 w-4" />
                        Edit Task
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Task</DialogTitle>
                      </DialogHeader>
                      <EditTaskForm
                        task={localTask}
                        onSuccess={() => {
                          setEditOpen(false);
                          router.refresh();
                          toast.success("Task updated successfully");
                        }}
                      />
                    </DialogContent>
                  </Dialog>

                  <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
                    <DialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          setReassignOpen(true);
                          fetchTeamMembers();
                        }}
                      >
                        <IconUser className="mr-2 h-4 w-4" />
                        Reassign
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reassign Task</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Label>Assign to</Label>
                        <Select
                          defaultValue={localTask.assigned_to}
                          onValueChange={handleReassign}
                          disabled={loading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select team member" />
                          </SelectTrigger>
                          <SelectContent>
                            {teamMembers.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name} (@{m.username})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {loading && (
                          <p className="text-sm text-muted-foreground">
                            Reassigning...
                          </p>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setDeleteOpen(true);
                    }}
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  >
                    <IconTrash className="mr-2 h-4 w-4" />
                    Delete Task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* ── Badges ── */}
      <div className="flex gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={getTeamTypeColor(localTask.team_type)}
        >
          {localTask.team_type}
        </Badge>
        <Badge
          variant="outline"
          className={getPriorityColor(localTask.priority)}
        >
          {localTask.priority}
        </Badge>
        <Badge variant="outline" className={getStatusColor(localTask.status)}>
          {localTask.status.replace(/_/g, " ")}
        </Badge>
        {(localTask.rework_count ?? 0) > 0 && (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-700 border-orange-200"
          >
            <IconRefresh className="h-3 w-3 mr-1" />
            Rework ×{localTask.rework_count}
          </Badge>
        )}
      </div>

      {/* ── 2-column layout ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* ══ LEFT (col-span-2): Task Details + Related Tasks + QA Feedback ══ */}
        <div className="xl:col-span-2 space-y-6">
          {/* Task Details */}
          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Description */}
              <div>
                <Label className="text-muted-foreground">Description</Label>
                {editingDesc ? (
                  <div className="flex flex-col gap-2 mt-2">
                    <RichTextEditor
                      content={descDraft}
                      onChange={(html) => setDescDraft(html)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={saveDescription}
                        disabled={savingField === "description"}
                      >
                        {savingField === "description" ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDescDraft(localTask.description ?? "");
                          setEditingDesc(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`mt-2 text-sm flex items-start gap-1 ${
                      canManageTask
                        ? "cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 py-1"
                        : ""
                    }`}
                    onClick={() => canManageTask && setEditingDesc(true)}
                  >
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none flex-1"
                      dangerouslySetInnerHTML={{
                        __html: localTask.description
                          ? localTask.description.replace(
                              /<p><\/p>/g,
                              "<p><br/></p>",
                            )
                          : "<span class='text-muted-foreground italic'>No description — click to add</span>",
                      }}
                    />
                    {canManageTask && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDesc(true);
                        }}
                      >
                        <IconEdit className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground flex items-center gap-2">
                    <IconPaperclip className="h-4 w-4" />
                    Attachments ({localFiles.length})
                  </Label>
                  {canManageTask && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleAddFiles}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={uploadingFiles}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <IconPlus className="h-3.5 w-3.5 mr-1" />
                        {uploadingFiles ? "Uploading..." : "Add Files"}
                      </Button>
                    </>
                  )}
                </div>

                {localFiles.length > 0 &&
                  (() => {
                    const imageFiles = localFiles.filter((f) =>
                      IMAGE_EXT.test(f.url),
                    );
                    const otherFiles = localFiles.filter(
                      (f) => !IMAGE_EXT.test(f.url),
                    );
                    return (
                      <div className="mt-3 space-y-3">
                        {imageFiles.length > 0 && (
                          <div className="space-y-1.5">
                            <ImageGalleryGrid
                              images={imageFiles}
                              onDownload={triggerDownload}
                              onPreview={(index) =>
                                setPreviewFiles({ files: imageFiles, index })
                              }
                              onRemove={
                                canManageTask
                                  ? (imgIndex) => {
                                      const target = imageFiles[imgIndex];
                                      const fullIndex = localFiles.findIndex(
                                        (f) => f.url === target.url,
                                      );
                                      if (fullIndex !== -1)
                                        handleRemoveFile(fullIndex);
                                    }
                                  : undefined
                              }
                            />
                          </div>
                        )}

                        {otherFiles.length > 0 && (
                          <div className="space-y-2">
                            {otherFiles.map((file, index) => {
                              const url = file.url;
                              const name =
                                file.original_name ??
                                file.name ??
                                `File ${index + 1}`;
                              const type = getFileType(url);
                              return (
                                <div
                                  key={index}
                                  className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                                  onClick={() => handleFileRowClick(file)}
                                >
                                  <div className="h-10 w-10 flex items-center justify-center bg-muted rounded-lg border text-xl shrink-0">
                                    {type === "video" ? (
                                      <video
                                        src={url}
                                        className="h-full w-full object-cover rounded-lg"
                                      />
                                    ) : (
                                      getFileIcon(type)
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {name}
                                    </p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                      {type}
                                      {file.size
                                        ? ` • ${formatFileSize(file.size)}`
                                        : ""}
                                    </p>
                                  </div>
                                  <div
                                    className="flex gap-1 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => triggerDownload(url, name)}
                                    >
                                      <IconDownload className="h-4 w-4" />
                                    </Button>
                                    {canManageTask && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveFile(
                                            localFiles.indexOf(file),
                                          );
                                        }}
                                      >
                                        <IconTrash className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                {localFiles.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground italic">
                    No attachments
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* QA Feedback Feed */}
          {canSeeQAFeedback && (
            <Card className="border-purple-100 dark:border-purple-900/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <div className="h-6 w-6 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                    <IconShieldCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span>QA Review History</span>
                  {(localTask.rework_count ?? 0) > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-auto text-orange-600 border-orange-200 bg-orange-50 dark:bg-orange-950/20 text-[10px] font-semibold"
                    >
                      {localTask.rework_count} rework
                      {(localTask.rework_count ?? 0) > 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Full review trail — separate from task comments
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <QAReviewInline
                  task={localTask}
                  userId={userId}
                  userName={userName}
                  canReview={
                    isQAAssignedToThisTask &&
                    localTask.status === "WAITING_FOR_QA"
                  }
                  onTaskUpdated={(updated) => {
                    setLocalTask(updated);
                    taskEvents.triggerTaskUpdated(
                      updated as unknown as TaskEvent,
                    );
                    notificationEvents.triggerNotificationReceived();
                    router.refresh();
                  }}
                  onTimerStop={setTimerStopped}
                />
              </CardContent>
            </Card>
          )}

          {/* ── NEW: Related Tasks Section ────────────────────────────────── */}
          {relatedTasks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <IconList className="h-4 w-4 text-muted-foreground" />
                  Related Tasks in Project
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {relatedTasks.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tasks from the same project (oldest first)
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {relatedTasks.map((related) => (
                    <Link
                      key={related.id}
                      href={`/tasks/${related.id}`}
                      className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        {/* Status indicator */}
                        <div
                          className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${
                            related.status === "IN_PROGRESS"
                              ? "bg-orange-500"
                              : related.status === "WAITING_FOR_QA"
                                ? "bg-purple-500"
                                : related.status === "APPROVED"
                                  ? "bg-green-500"
                                  : related.status === "REWORK"
                                    ? "bg-red-500"
                                    : "bg-gray-400"
                          }`}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                              {related.title}
                            </p>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-5 ${getPriorityColor(related.priority)}`}
                            >
                              {related.priority}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            {/* Assignee */}
                            {related.assigned_to && (
                              <div className="flex items-center gap-1">
                                <Avatar className="h-4 w-4">
                                  <AvatarImage
                                    src={
                                      related.assignedUserAvatar ?? undefined
                                    }
                                  />
                                  <AvatarFallback className="text-[9px] bg-muted">
                                    {related.assignedUserName?.[0]?.toUpperCase() ??
                                      "U"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate max-w-[100px]">
                                  {related.assignedUserName ?? "Unassigned"}
                                </span>
                              </div>
                            )}

                            {/* Created date */}
                            {related.created_at && (
                              <span className="flex items-center gap-1">
                                <IconCalendar className="h-3 w-3" />
                                {new Date(
                                  related.created_at,
                                ).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Chevron */}
                        <IconArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>

                {/* View all link (optional) */}
                {relatedTasks.length >= 10 && task.project_id && (
                  <div className="pt-2 mt-2 border-t">
                    <Link
                      href={`/projects/${task.project_id}?view=tasks&sort=oldest`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      View all project tasks
                      <IconArrowLeft className="h-3 w-3 rotate-180" />
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {/* ── END: Related Tasks Section ────────────────────────────────── */}
        </div>

        {/* ══ RIGHT (col-span-1): Task Info + Comments ══ */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!!localTask.estimated_minutes && (
                <>
                  <div>
                    <Label className="text-muted-foreground flex items-center gap-2 mb-2">
                      <IconClock className="h-4 w-4" />
                      Progress Timer
                    </Label>
                    <TaskTimer
                      startedAt={localTask.started_at ?? localTask.created_at}
                      estimatedMinutes={localTask.estimated_minutes}
                      taskId={localTask.id}
                      assignedUserId={localTask.assigned_to ?? ""}
                      currentUserId={userId}
                      onTimeExceeded={handleTimeExceeded}
                      stopped={timerStopped}
                    />
                  </div>
                  <Separator />
                </>
              )}

              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <IconUser className="h-4 w-4" />
                  Assigned To
                </Label>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={localTask.assignedUserAvatar ?? undefined}
                    />
                    <AvatarFallback className="bg-blue-600 text-white text-xs">
                      {localTask.assignedUserName?.[0]?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {localTask.assignedUserName ?? "Unassigned"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      @{localTask.assignedByUsername}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <IconUserCheck className="h-4 w-4 text-purple-500" />
                  QA Reviewer
                </Label>
                <div className="mt-2">
                  {localTask.qa_assigned_to ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={localTask.qaAssignedUserAvatar ?? undefined}
                        />
                        <AvatarFallback className="bg-purple-600 text-white text-xs">
                          {localTask.qaAssignedUserName
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) ?? "QA"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {localTask.qaAssignedUserName ?? "QA User"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Assigned for review
                        </p>
                      </div>
                    </div>
                  ) : showAssignQaButton ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start border-purple-200 text-purple-600 hover:bg-purple-50"
                      onClick={() => {
                        setQaDialogOpen(true);
                        fetchQaUsers();
                      }}
                    >
                      <IconUserCheck className="mr-2 h-4 w-4" />
                      Assign QA
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      Not assigned
                    </span>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <IconClock className="h-4 w-4" />
                  Estimated Time
                </Label>
                <p className="mt-2 text-sm font-medium">
                  {formatTime(localTask.estimated_minutes)}
                </p>
              </div>

              <Separator />

              <div>
                <Label className="text-muted-foreground flex items-center gap-2">
                  <IconCalendar className="h-4 w-4" />
                  Created
                </Label>
                <p className="mt-2 text-sm">
                  {formatDate(localTask.created_at)}
                </p>
              </div>

              {localTask.updated_at && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground">
                      Last Updated
                    </Label>
                    <p className="mt-2 text-sm">
                      {formatDate(localTask.updated_at)}
                    </p>
                  </div>
                </>
              )}

              {(localTask.rework_count ?? 0) > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-muted-foreground flex items-center gap-2">
                      <IconRefresh className="h-4 w-4" />
                      Rework Count
                    </Label>
                    <p className="mt-2 text-sm font-medium text-orange-600">
                      {localTask.rework_count} time
                      {localTask.rework_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Comments</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="min-h-[300px] max-h-[600px] flex flex-col">
                <TaskComments
                  taskId={localTask.id}
                  currentUserId={userId}
                  currentUserName={userName}
                  currentUserRole={userRole}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Image Lightbox */}
      {previewFiles && (
        <ImageLightbox
          images={previewFiles.files}
          startIndex={previewFiles.index}
          onClose={() => setPreviewFiles(null)}
          onDownload={triggerDownload}
        />
      )}

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Delete Task</DialogTitle>
            </div>
            <DialogDescription className="pt-4">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                `{localTask.title}`
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Deleting...
                </>
              ) : (
                <>
                  <IconTrash className="mr-2 h-4 w-4" />
                  Delete Task
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QA Assign Dialog ── */}
      <Dialog open={qaDialogOpen} onOpenChange={setQaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <IconUserCheck className="h-5 w-5 text-purple-600" />
              </div>
              <DialogTitle>Assign to QA</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Select a QA reviewer for this task.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {loadingQaUsers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                Loading QA users...
              </div>
            ) : (
              <Select value={selectedQaUser} onValueChange={setSelectedQaUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a QA reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {qaUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}{" "}
                      <span className="text-muted-foreground">
                        @{u.username}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setQaDialogOpen(false)}
              disabled={assigningQA}
            >
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleAssignQa}
              disabled={assigningQA || !selectedQaUser || loadingQaUsers}
            >
              {assigningQA ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Assigning...
                </>
              ) : (
                <>
                  <IconUserCheck className="mr-2 h-4 w-4" />
                  Assign to QA
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── EDIT TASK FORM ───────────────────────────────────────────────────────────
// (EditTaskForm component remains unchanged - paste your existing code here)
// For brevity, I'm not repeating the full EditTaskForm component.
// Just ensure it stays at the bottom of this file as in your original code.

// ─── EDIT TASK FORM ───────────────────────────────────────────────────────────

type PendingFile = {
  file: File;
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  uploadedData?: TaskFile;
  error?: string;
};

interface EditTaskFormProps {
  task: TaskData;
  onSuccess: () => void;
}

interface EditTaskFormState {
  project_id: string;
  team_type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to: string;
  due_date: Date | null;
}

const todayStart = () => new Date(new Date().setHours(0, 0, 0, 0));

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIconByUrl = (url: string): string => {
  if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return "🖼️";
  if (url.match(/\.(mp4|webm|mov|avi|mkv)$/i)) return "🎬";
  if (url.match(/\.(pdf)$/i)) return "📕";
  if (url.match(/\.(doc|docx)$/i)) return "📝";
  return "📎";
};

function EditTaskForm({ task, onSuccess }: EditTaskFormProps) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [fetchingData, setFetchingData] = useState(false);

  const [existingFiles, setExistingFiles] = useState<TaskFile[]>(() => {
    try {
      return task.files ? (JSON.parse(task.files) as TaskFile[]) : [];
    } catch {
      return [];
    }
  });

  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const initialDueDate = (): Date | null => {
    if (!task.estimated_minutes) return null;
    const base = task.created_at ? new Date(task.created_at) : new Date();
    return new Date(base.getTime() + task.estimated_minutes * 60 * 1000);
  };

  const [formData, setFormData] = useState<EditTaskFormState>({
    project_id: task.project_id ?? "",
    team_type: task.team_type ?? "",
    title: task.title ?? "",
    description: task.description ?? "",
    priority: task.priority ?? "MEDIUM",
    status: task.status ?? "IN_PROGRESS",
    assigned_to: task.assigned_to ?? "",
    due_date: initialDueDate(),
  });

  // ── Fetch team options from API ───────────────────────────────────────────
  async function fetchTeamOptions(): Promise<void> {
    try {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error(`Failed to fetch teams: ${res.status}`);
      const data = await res.json();
      const teams: TeamOption[] = Array.isArray(data)
        ? data
        : (data.data ?? data.teams ?? []);
      setTeamOptions(teams);
    } catch (error) {
      console.error("Failed to fetch team options:", error);
      // Fallback to hardcoded options if API fails
      setTeamOptions([
        { id: "1", name: "Developer", slug: "DEVELOPER" },
        { id: "2", name: "Designer", slug: "DESIGNER" },
        { id: "3", name: "Programmer", slug: "PROGRAMMER" },
      ]);
    }
  }

  useEffect(() => {
    fetchProjects();
    fetchTeamMembersForForm();
    fetchTeamOptions();
  }, []);

  const uploadSingleFile = async (
    file: File,
    id: string,
  ): Promise<PendingFile> => {
    try {
      const result: UploadResult = await uploadFile(file, (pct) => {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, progress: pct } : p)),
        );
      });

      const uploadedData: TaskFile = {
        url: result.url,
        public_id: result.public_id,
        name: result.name,
        original_name: result.original_name,
        resource_type: result.resource_type,
        size: result.size,
        storage: result.storage,
      };

      setPendingFiles((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: "uploaded", progress: 100, uploadedData }
            : p,
        ),
      );

      return {
        file,
        id,
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

  const addNewFiles = (incoming: File[]) => {
    const existingNames = new Set([
      ...existingFiles.map((f) => f.name),
      ...pendingFiles.map((pf) => pf.file.name),
    ]);

    const toAdd = incoming.filter((f) => {
      if (existingNames.has(f.name)) {
        toast.error(`File "${f.name}" already exists`);
        return false;
      }
      existingNames.add(f.name);
      return true;
    });

    if (toAdd.length === 0) return;

    toAdd.forEach((file, idx) => {
      const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      setPendingFiles((prev) => [
        ...prev,
        { file, id, status: "uploading", progress: 0 },
      ]);

      setTimeout(() => {
        uploadSingleFile(file, id).catch(() => {});
      }, idx * 100);
    });

    toast.success(
      `Uploading ${toAdd.length} file${toAdd.length > 1 ? "s" : ""}...`,
    );
  };

  const removeExistingFile = async (publicId: string): Promise<void> => {
    const fileToRemove = existingFiles.find((f) => f.public_id === publicId);

    setExistingFiles((prev) => prev.filter((f) => f.public_id !== publicId));

    if (fileToRemove?.public_id) {
      try {
        await deleteFile({
          public_id: fileToRemove.public_id,
          resource_type: fileToRemove.resource_type,
          storage:
            fileToRemove.storage ?? detectStorageFromFile(fileToRemove.url),
          url: fileToRemove.url,
        });
      } catch {
        console.warn("Failed to delete existing file from storage:", publicId);
      }
    }
  };

  const removePendingFile = async (id: string): Promise<void> => {
    const pending = pendingFiles.find((p) => p.id === id);

    setPendingFiles((prev) => prev.filter((p) => p.id !== id));

    if (pending?.status === "uploaded" && pending.uploadedData?.public_id) {
      try {
        await deleteFile({
          public_id: pending.uploadedData.public_id,
          resource_type: pending.uploadedData.resource_type,
          storage:
            pending.uploadedData.storage ??
            detectStorageFromFile(pending.uploadedData.url),
          url: pending.uploadedData.url,
        });
      } catch {
        console.warn("Failed to delete pending file from storage:", id);
      }
    }
  };

  const uploadFilesFunc = async (): Promise<TaskFile[]> => {
    const uploaded: TaskFile[] = [];
    for (const file of pendingFiles) {
      if (file.status === "uploaded" && file.uploadedData) {
        uploaded.push(file.uploadedData);
      }
    }
    return uploaded;
  };

  async function fetchProjects(): Promise<void> {
    setFetchingData(true);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        data?: Project[];
        projects?: Project[];
        allProjects?: Project[];
      };
      setProjects(data.data ?? data.projects ?? data.allProjects ?? []);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setFetchingData(false);
    }
  }

  async function fetchTeamMembersForForm(): Promise<void> {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as
        | { data?: TeamMember[]; users?: TeamMember[]; allUsers?: TeamMember[] }
        | TeamMember[];
      setTeamMembers(
        Array.isArray(data)
          ? data
          : (data.data ?? data.users ?? data.allUsers ?? []),
      );
    } catch {
      console.error("Failed to fetch team members");
    }
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
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
      const uploadedNew = await uploadFilesFunc();
      const allFiles: TaskFile[] = [...existingFiles, ...uploadedNew];

      const estimated_minutes = formData.due_date
        ? Math.max(
            1,
            Math.round((formData.due_date.getTime() - Date.now()) / 60000),
          )
        : null;

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: formData.project_id,
          team_type: formData.team_type,
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          status: formData.status,
          assigned_to: formData.assigned_to,
          estimated_minutes,
          due_date: formData.due_date ? formData.due_date.toISOString() : null,
          files: JSON.stringify(allFiles),
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed to update task");
      }
      toast.success("Task updated successfully");
      onSuccess();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update task",
      );
    } finally {
      setLoading(false);
    }
  };

  const hasUploadingFiles = pendingFiles.some((p) => p.status === "uploading");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Project */}
      <div className="space-y-2">
        <Label>Project *</Label>
        <Select
          value={formData.project_id}
          onValueChange={(v) => setFormData({ ...formData, project_id: v })}
          disabled={fetchingData || projects.length === 0}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={fetchingData ? "Loading..." : "Select a project"}
            />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Team Type - DYNAMIC FROM API */}
      <div className="space-y-2">
        <Label>Team Type *</Label>
        <Select
          value={formData.team_type}
          onValueChange={(v) => setFormData({ ...formData, team_type: v })}
          disabled={fetchingData || teamOptions.length === 0}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                fetchingData
                  ? "Loading..."
                  : teamOptions.length === 0
                    ? "No teams available"
                    : "Select team type"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {teamOptions.map((t) => (
              <SelectItem key={t.id} value={t.slug}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {teamOptions.length === 0 && !fetchingData && (
          <p className="text-sm text-muted-foreground">
            No team types found. Please contact an administrator.
          </p>
        )}
      </div>

      {/* Title */}
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      {/* Description - RichTextEditor Integration */}
      <div className="space-y-2">
        <Label>Description</Label>
        <RichTextEditor
          content={formData.description}
          onChange={(html) => setFormData({ ...formData, description: html })}
        />
      </div>

      {/* Priority + Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priority *</Label>
          <Select
            value={formData.priority}
            onValueChange={(v) => setFormData({ ...formData, priority: v })}
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
        <div className="space-y-2">
          <Label>Status *</Label>
          <Select
            value={formData.status}
            onValueChange={(v) => setFormData({ ...formData, status: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="WAITING_FOR_QA">Waiting for QA</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REWORK">Rework</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deadline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <IconCalendar className="h-3.5 w-3.5 text-muted-foreground" />
            Deadline
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              Optional
            </span>
          </Label>
        </div>
        <DateTimePicker
          value={formData.due_date}
          onChange={(date) => setFormData({ ...formData, due_date: date })}
          placeholder="Pick a deadline date & time"
          minDate={todayStart()}
        />
        {formData.due_date && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {Math.max(
                0,
                Math.round(
                  (formData.due_date.getTime() - Date.now()) / (1000 * 60 * 60),
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

      {/* Assign To */}
      <div className="space-y-2">
        <Label>Assign To *</Label>
        <Select
          value={formData.assigned_to}
          onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select team member" />
          </SelectTrigger>
          <SelectContent>
            {teamMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} (@{m.username})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Attachments with Eager Upload UI */}
      <div className="space-y-3">
        <Label>Attachments</Label>

        {existingFiles.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Current files
            </p>
            {existingFiles.map((file) => (
              <div
                key={file.public_id}
                className="flex items-center justify-between p-2 bg-muted rounded border"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">
                    {getFileIconByUrl(file.url ?? "")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm truncate max-w-[220px]">
                      {file.name ?? file.original_name ?? "File"}
                    </p>
                    {file.size && (
                      <p className="text-xs text-muted-foreground">
                        {formatSize(file.size)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    asChild
                  >
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconDownload className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeExistingFile(file.public_id)}
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

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
            addNewFiles(Array.from(e.dataTransfer.files));
          }}
          onPaste={(e) => addNewFiles(Array.from(e.clipboardData.files))}
          tabIndex={0}
        >
          <Input
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files) addNewFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
            className="hidden"
            id="edit-task-files"
          />
          <Label
            htmlFor="edit-task-files"
            className="flex flex-col items-center justify-center cursor-pointer gap-2 select-none"
          >
            <IconUpload className="h-7 w-7 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                Drop files here, paste, or{" "}
                <span className="text-primary underline">browse</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Files start uploading immediately
              </p>
            </div>
          </Label>
        </div>

        {pendingFiles.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              New files
            </p>
            {pendingFiles.map((pf) => (
              <div
                key={pf.id}
                className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                  pf.status === "error"
                    ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
                    : pf.status === "uploaded"
                      ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                      : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                }`}
              >
                <div className="relative h-9 w-9 shrink-0 rounded border bg-background flex items-center justify-center">
                  <IconPaperclip className="h-4 w-4 text-muted-foreground" />
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
                  <p className="text-sm font-medium truncate max-w-[200px]">
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
                    className="h-6 w-6 shrink-0"
                    onClick={() => removePendingFile(pf.id)}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onSuccess}
          className="flex-1"
          disabled={loading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={loading || fetchingData || hasUploadingFiles}
        >
          {loading ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Updating...
            </>
          ) : hasUploadingFiles ? (
            <>
              <IconLoader className="mr-2 h-4 w-4 animate-spin" />
              Waiting for uploads...
            </>
          ) : (
            "Update Task"
          )}
        </Button>
      </div>
    </form>
  );
}
