"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import RichTextEditor from "@/components/rich-text-editor";
import { uploadFile, deleteFile } from "@/lib/upload-file";
import {
  IconArrowRight,
  IconCheck,
  IconX,
  IconEdit,
  IconPaperclip,
  IconDownload,
  IconTrash,
  IconUser,
  IconUserCheck,
  IconRefresh,
  IconLoader,
  IconExternalLink,
  IconFile,
  IconPhoto,
  IconDeviceFloppy,
  IconAlertCircle,
} from "@tabler/icons-react";
import { TaskComments } from "../[taskId]/task-comments";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SheetTaskData {
  id: string;
  title: string;
  description?: string | null;
  projectName?: string | null;
  team_type?: string | null;
  priority?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  assignedUserName?: string | null;
  assignedUserAvatar?: string | null;
  assignedByUsername?: string | null;
  qa_assigned_to?: string | null;
  qaAssignedUserName?: string | null;
  qaAssignedUserAvatar?: string | null;
  files?: string | null;
  rework_count?: number | null;
  estimated_minutes?: number | null;
  created_at?: string | Date | null;
}

interface TaskFile {
  url: string;
  public_id: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
}

interface TaskSheetProps {
  taskId: string | null;
  userRole: string;
  userId: string;
  userName: string;
  onClose: () => void;
  onTaskUpdated?: (updated: Partial<SheetTaskData>) => void;
}

// ─── Draft helpers ────────────────────────────────────────────────────────────

interface DraftData {
  title?: string;
  description?: string;
  savedAt: number; // timestamp so we can show "last saved X ago"
}

function draftKey(taskId: string) {
  return `task-sheet-draft:${taskId}`;
}

function loadDraft(taskId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(taskId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch {
    return null;
  }
}

function saveDraft(taskId: string, data: Partial<Omit<DraftData, "savedAt">>) {
  try {
    const existing = loadDraft(taskId) ?? {};
    localStorage.setItem(
      draftKey(taskId),
      JSON.stringify({ ...existing, ...data, savedAt: Date.now() }),
    );
  } catch {
    // localStorage quota — silently ignore
  }
}

function clearDraft(taskId: string) {
  try {
    localStorage.removeItem(draftKey(taskId));
  } catch {
    //
  }
}

function hasDraftDiff(
  draft: DraftData | null,
  task: SheetTaskData | null,
): { title: boolean; description: boolean } {
  if (!draft || !task) return { title: false, description: false };
  return {
    title:
      draft.title !== undefined && draft.title.trim() !== task.title.trim(),
    description:
      draft.description !== undefined &&
      draft.description !== (task.description ?? ""),
  };
}

function fmtDraftAge(savedAt: number) {
  const sec = Math.floor((Date.now() - savedAt) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: "bg-orange-100 text-orange-700 border-orange-200",
  WAITING_FOR_QA: "bg-purple-100 text-purple-700 border-purple-200",
  APPROVED: "bg-green-100  text-green-700  border-green-200",
  REWORK: "bg-red-100    text-red-700    border-red-200",
};
const PRIORITY_COLOR: Record<string, string> = {
  HIGH: "bg-red-100    text-red-700    border-red-200",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-200",
  LOW: "bg-green-100  text-green-700  border-green-200",
};
const TEAM_COLOR: Record<string, string> = {
  DEVELOPER: "bg-blue-100   text-blue-700   border-blue-200",
  DESIGNER: "bg-pink-100   text-pink-700   border-pink-200",
  PROGRAMMER: "bg-indigo-100 text-indigo-700 border-indigo-200",
};

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const VIEWABLE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|webm|mov)$/i;

function parseFiles(raw?: string | null): TaskFile[] {
  if (!raw) return [];
  try {
    const p: unknown = JSON.parse(raw);
    if (!Array.isArray(p)) return [];
    return (p as unknown[]).map((f) => {
      if (typeof f === "string") return { url: f, public_id: "" };
      const file = f as TaskFile;
      return {
        url: file.url ?? "",
        public_id: file.public_id ?? "",
        name: file.name,
        original_name: file.original_name,
        resource_type: file.resource_type,
        size: file.size,
      };
    });
  } catch {
    return [];
  }
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const PRIVILEGED = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"];

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Draft banner ─────────────────────────────────────────────────────────────
function DraftBanner({
  draft,
  onRestore,
  onDiscard,
}: {
  draft: DraftData;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mx-5 mb-3 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <IconAlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="flex-1">
        Unsaved draft from {fmtDraftAge(draft.savedAt)}
      </span>
      <button
        onClick={onRestore}
        className="font-semibold underline underline-offset-2 hover:text-amber-900"
      >
        Restore
      </button>
      <span className="text-amber-300">|</span>
      <button onClick={onDiscard} className="hover:text-amber-900">
        Discard
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaskSheet({
  taskId,
  userRole,
  userId,
  userName,
  onClose,
  onTaskUpdated,
}: TaskSheetProps) {
  const [task, setTask] = useState<SheetTaskData | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingField, setSavingField] = useState<"title" | "desc" | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "comments">("details");

  // ── Draft state ──────────────────────────────────────────────────────────
  const [pendingDraft, setPendingDraft] = useState<DraftData | null>(null);
  // Tracks whether editing fields currently have unsaved localStorage content
  const titleDraftDirtyRef = useRef(false);
  const descDraftDirtyRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canManage = PRIVILEGED.includes(userRole);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as
        | { task?: SheetTaskData }
        | SheetTaskData;
      const t =
        (data as { task?: SheetTaskData }).task ?? (data as SheetTaskData);
      if (t?.id) {
        setTask(t);
        setFiles(parseFiles(t.files));
        setTitleDraft(t.title);
        setDescDraft(t.description ?? "");

        // Check if there's a saved draft that differs from server state
        const draft = loadDraft(t.id);
        const diff = hasDraftDiff(draft, t);
        if (diff.title || diff.description) {
          setPendingDraft(draft);
        } else {
          // Draft matches server — no point keeping it
          if (draft) clearDraft(t.id);
          setPendingDraft(null);
        }
      }
    } catch {
      toast.error("Failed to load task");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      setTask(null);
      setEditingTitle(false);
      setEditingDesc(false);
      setActiveTab("details");
      titleDraftDirtyRef.current = false;
      descDraftDirtyRef.current = false;
      void fetchTask();
    }
  }, [taskId, fetchTask]);

  // ── Auto-save draft to localStorage while typing ───────────────────────────
  // Title draft — debounced 600ms
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTitleChange = (val: string) => {
    setTitleDraft(val);
    titleDraftDirtyRef.current = true;
    if (!task) return;
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(() => {
      saveDraft(task.id, { title: val });
    }, 600);
  };

  // Description draft — debounced 800ms
  const descDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDescChange = (html: string) => {
    setDescDraft(html);
    descDraftDirtyRef.current = true;
    if (!task) return;
    if (descDebounceRef.current) clearTimeout(descDebounceRef.current);
    descDebounceRef.current = setTimeout(() => {
      saveDraft(task.id, { description: html });
    }, 800);
  };

  // ── Restore draft ──────────────────────────────────────────────────────────
  function handleRestoreDraft() {
    if (!pendingDraft || !task) return;
    const diff = hasDraftDiff(pendingDraft, task);
    if (diff.title && pendingDraft.title !== undefined) {
      setTitleDraft(pendingDraft.title);
      setEditingTitle(true);
    }
    if (diff.description && pendingDraft.description !== undefined) {
      setDescDraft(pendingDraft.description);
      setEditingDesc(true);
    }
    setPendingDraft(null);
    toast.success("Draft restored");
  }

  function handleDiscardDraft() {
    if (!task) return;
    clearDraft(task.id);
    setPendingDraft(null);
    toast("Draft discarded");
  }

  // ── Patch ──────────────────────────────────────────────────────────────────
  const patch = async (body: Record<string, unknown>) => {
    if (!task) return;
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update");
    const data = (await res.json()) as { task?: SheetTaskData };
    if (data.task) {
      setTask((prev) => (prev ? { ...prev, ...data.task } : data.task!));
      onTaskUpdated?.(data.task!);
    }
  };

  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === task?.title) {
      setEditingTitle(false);
      titleDraftDirtyRef.current = false;
      return;
    }
    setSavingField("title");
    try {
      await patch({ title: titleDraft.trim() });
      setEditingTitle(false);
      titleDraftDirtyRef.current = false;
      // Clear title from draft (keep desc draft if any)
      if (task) saveDraft(task.id, { title: titleDraft.trim() });
      // If desc also clean, wipe entirely
      if (task && !descDraftDirtyRef.current) clearDraft(task.id);
      toast.success("Title updated");
    } catch {
      toast.error("Failed to update title");
    } finally {
      setSavingField(null);
    }
  };

  const saveDesc = async () => {
    setSavingField("desc");
    try {
      await patch({ description: descDraft });
      setEditingDesc(false);
      descDraftDirtyRef.current = false;
      if (task && !titleDraftDirtyRef.current) clearDraft(task.id);
      toast.success("Description updated");
    } catch {
      toast.error("Failed to update description");
    } finally {
      setSavingField(null);
    }
  };

  const cancelTitle = () => {
    if (!task) return;
    setTitleDraft(task.title);
    setEditingTitle(false);
    titleDraftDirtyRef.current = false;
    // Remove title key from draft
    const existing = loadDraft(task.id);
    if (existing) {
      const { title: _t, ...rest } = existing;
      if (Object.keys(rest).filter((k) => k !== "savedAt").length === 0) {
        clearDraft(task.id);
      } else {
        saveDraft(task.id, rest);
      }
    }
  };

  const cancelDesc = () => {
    if (!task) return;
    setDescDraft(task.description ?? "");
    setEditingDesc(false);
    descDraftDirtyRef.current = false;
    const existing = loadDraft(task.id);
    if (existing) {
      const { description: _d, ...rest } = existing;
      if (Object.keys(rest).filter((k) => k !== "savedAt").length === 0) {
        clearDraft(task.id);
      } else {
        saveDraft(task.id, rest);
      }
    }
  };

  // ── Files ──────────────────────────────────────────────────────────────────
  const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || !selected.length || !task) return;
    setUploadingFile(true);
    try {
      const uploaded: TaskFile[] = [];
      for (const file of Array.from(selected)) {
        const result = await uploadFile(file);
        uploaded.push({
          url: result.url,
          public_id: result.public_id,
          name: file.name,
          original_name: file.name,
          resource_type: result.resource_type,
          size: file.size,
        });
      }
      const merged = [...files, ...uploaded];
      await patch({ files: JSON.stringify(merged) });
      setFiles(merged);
      toast.success(`${uploaded.length} file(s) added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = async (idx: number) => {
    const fileToRemove = files[idx];
    const updated = files.filter((_, i) => i !== idx);
    try {
      await patch({ files: JSON.stringify(updated) });
      setFiles(updated);
      if (fileToRemove?.public_id) {
        void deleteFile({
          public_id: fileToRemove.public_id,
          resource_type: fileToRemove.resource_type,
          storage: (fileToRemove as { storage?: string }).storage,
          url: fileToRemove.url,
        });
      }
    } catch {
      toast.error("Failed to remove file");
    }
  };

  const triggerDownload = async (url: string, name: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: name,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  if (!taskId) return null;

  const imageFiles = files.filter((f) => IMAGE_EXT.test(f.url));
  const otherFiles = files.filter((f) => !IMAGE_EXT.test(f.url));

  return (
    <Sheet
      open={!!taskId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] p-0 flex flex-col h-full overflow-hidden [&>div]:h-full [&>div]:flex [&>div]:flex-col"
      >
        {loading || !task ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0">
            {/* Title */}
            <div className="px-5 pb-3 pt-4">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveTitle();
                      if (e.key === "Escape") cancelTitle();
                    }}
                    className="h-9 font-semibold flex-1"
                    disabled={savingField === "title"}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-green-600"
                    onClick={() => void saveTitle()}
                    disabled={savingField === "title"}
                  >
                    {savingField === "title" ? (
                      <IconLoader className="h-4 w-4 animate-spin" />
                    ) : (
                      <IconCheck className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={cancelTitle}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className={`group flex items-start gap-1.5 ${canManage ? "cursor-pointer" : ""}`}
                  onClick={() => canManage && setEditingTitle(true)}
                >
                  <h2 className="text-lg font-semibold leading-snug">
                    {task.title}
                  </h2>
                  {canManage && (
                    <IconEdit className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 shrink-0 mt-1 transition-opacity" />
                  )}
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 px-5 pb-3">
              {task.team_type && (
                <Badge
                  variant="outline"
                  className={`text-[11px] h-5 ${TEAM_COLOR[task.team_type] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {task.team_type}
                </Badge>
              )}
              {task.priority && (
                <Badge
                  variant="outline"
                  className={`text-[11px] h-5 ${PRIORITY_COLOR[task.priority] ?? ""}`}
                >
                  {task.priority}
                </Badge>
              )}
              {task.status && (
                <Badge
                  variant="outline"
                  className={`text-[11px] h-5 ${STATUS_COLOR[task.status] ?? ""}`}
                >
                  {task.status.replace(/_/g, " ")}
                </Badge>
              )}
              {(task.rework_count ?? 0) > 0 && (
                <Badge
                  variant="outline"
                  className="text-[11px] h-5 bg-orange-100 text-orange-700 border-orange-200"
                >
                  <IconRefresh className="h-3 w-3 mr-1" />
                  Rework ×{task.rework_count}
                </Badge>
              )}
            </div>

            {/* ══ HEADER — fixed, never scrolls ══ */}
            <div className="shrink-0 border-b bg-background">
              {/* Top bar: project name + open link */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <p className="text-xs text-muted-foreground truncate max-w-[70%]">
                  {task.projectName ?? ""}
                </p>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Link href={`/tasks/${task.id}`}>
                    Open full page
                    <IconExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </div>

              {/* Tab bar */}
              <div className="flex border-t">
                {(["details", "comments"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                      activeTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* ══ BODY — scrollable, fills remaining height ══ */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {/* ── Details tab ── */}
              {activeTab === "details" && (
                <ScrollArea className="h-full w-full">
                  <div className="py-5 space-y-6 w-full">
                    {/* Draft recovery banner — shown when a previous unsaved draft exists */}
                    {pendingDraft && (
                      <div className="px-0">
                        <DraftBanner
                          draft={pendingDraft}
                          onRestore={handleRestoreDraft}
                          onDiscard={handleDiscardDraft}
                        />
                      </div>
                    )}

                    <div className="px-5 space-y-6">
                      {/* People */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
                            Assigned To
                          </p>
                          {task.assignedUserName ? (
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage
                                  src={task.assignedUserAvatar ?? undefined}
                                />
                                <AvatarFallback className="bg-blue-600 text-white text-xs">
                                  {getInitials(task.assignedUserName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium leading-none truncate">
                                  {task.assignedUserName}
                                </p>
                                {task.assignedByUsername && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    @{task.assignedByUsername}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              Unassigned
                            </p>
                          )}
                        </div>

                        {task.qa_assigned_to && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
                              QA Reviewer
                            </p>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage
                                  src={task.qaAssignedUserAvatar ?? undefined}
                                />
                                <AvatarFallback className="bg-purple-600 text-white text-xs">
                                  {getInitials(task.qaAssignedUserName ?? "QA")}
                                </AvatarFallback>
                              </Avatar>
                              <p className="text-sm font-medium truncate">
                                {task.qaAssignedUserName ?? "QA"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Description */}
                      <Section
                        title="Description"
                        action={
                          canManage && !editingDesc ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                              onClick={() => {
                                setDescDraft(task.description ?? "");
                                setEditingDesc(true);
                              }}
                            >
                              <IconEdit className="h-3 w-3" />
                              Edit
                            </Button>
                          ) : null
                        }
                      >
                        {editingDesc ? (
                          <div className="space-y-2">
                            {/* Autosave indicator */}
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                              <IconDeviceFloppy className="h-3 w-3" />
                              <span>Draft auto-saved locally</span>
                            </div>
                            <div className="max-h-[280px] overflow-y-auto rounded-lg">
                              <RichTextEditor
                                content={descDraft}
                                onChange={handleDescChange}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs gap-1.5"
                                onClick={() => void saveDesc()}
                                disabled={savingField === "desc"}
                              >
                                {savingField === "desc" ? (
                                  <>
                                    <IconLoader className="h-3 w-3 animate-spin" />
                                    Saving…
                                  </>
                                ) : (
                                  <>
                                    <IconCheck className="h-3 w-3" />
                                    Save
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-3 text-xs"
                                onClick={cancelDesc}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`rounded-md text-sm leading-relaxed break-words overflow-wrap-anywhere
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1
        [&_h3]:text-sm  [&_h3]:font-semibold [&_h3]:mt-2
        [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_p:empty]:h-4
        [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1
        [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1
        [&_li]:mb-0.5
        [&_strong]:font-semibold [&_em]:italic
        [&_a]:break-all [&_a]:text-blue-500 [&_a]:underline
        [&_code]:break-all [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded
        ${canManage ? "cursor-pointer hover:bg-muted/40 p-2 -mx-2 transition-colors rounded-md" : ""}`}
                            onClick={() => {
                              if (canManage) {
                                setDescDraft(task.description ?? "");
                                setEditingDesc(true);
                              }
                            }}
                            dangerouslySetInnerHTML={{
                              __html:
                                task.description ||
                                "<span class='text-muted-foreground italic text-sm'>No description — click to add</span>",
                            }}
                          />
                        )}
                      </Section>

                      <Separator />

                      {/* Attachments */}
                      <Section
                        title={`Attachments${files.length > 0 ? ` (${files.length})` : ""}`}
                        action={
                          canManage ? (
                            <>
                              <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={handleAddFile}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                                disabled={uploadingFile}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {uploadingFile ? (
                                  <>
                                    <IconLoader className="h-3 w-3 animate-spin" />
                                    Uploading…
                                  </>
                                ) : (
                                  <>+ Add files</>
                                )}
                              </Button>
                            </>
                          ) : null
                        }
                      >
                        {files.length === 0 ? (
                          <div className="flex items-center gap-2 py-3 px-3 rounded-lg border border-dashed text-muted-foreground/60">
                            <IconPaperclip className="h-4 w-4 shrink-0" />
                            <p className="text-sm">No attachments yet</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {/* Image grid */}
                            {imageFiles.length > 0 && (
                              <div className="grid grid-cols-3 gap-2">
                                {imageFiles.map((file, i) => {
                                  const name =
                                    file.original_name ??
                                    file.name ??
                                    `Image ${i + 1}`;
                                  return (
                                    <div
                                      key={i}
                                      className="relative group/img aspect-square rounded-lg overflow-hidden border bg-muted"
                                    >
                                      <img
                                        src={file.url}
                                        alt={name}
                                        className="w-full h-full object-cover"
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/40 transition-colors flex items-end justify-end p-1 gap-1">
                                        <button
                                          className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 rounded p-1 relative z-20"
                                          onClick={() =>
                                            window.open(
                                              file.url,
                                              "_blank",
                                              "noopener,noreferrer",
                                            )
                                          }
                                          title="View"
                                        >
                                          <IconPhoto className="h-3 w-3 text-white" />
                                        </button>
                                        <button
                                          className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 rounded p-1 z-20 relative"
                                          onClick={() =>
                                            triggerDownload(file.url, name)
                                          }
                                          title="Download"
                                        >
                                          <IconDownload className="h-3 w-3 text-white" />
                                        </button>
                                        {canManage && (
                                          <button
                                            className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-red-600/80 hover:bg-red-600 rounded p-1 relative z-20"
                                            onClick={() =>
                                              void removeFile(
                                                files.indexOf(file),
                                              )
                                            }
                                            title="Remove"
                                          >
                                            <IconTrash className="h-3 w-3 text-white" />
                                          </button>
                                        )}
                                      </div>
                                      <p className="absolute bottom-0 left-0 right-0 px-1.5 py-1 text-[10px] text-white bg-black/50 truncate opacity-0 group-hover/img:opacity-100 transition-opacity">
                                        {name}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Other files list */}
                            {otherFiles.length > 0 && (
                              <div className="space-y-1">
                                {otherFiles.map((file, i) => {
                                  const name =
                                    file.original_name ??
                                    file.name ??
                                    `File ${i + 1}`;
                                  return (
                                    <div
                                      key={i}
                                      className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/50 transition-colors group/file"
                                    >
                                      <div className="h-8 w-8 rounded-md bg-muted border flex items-center justify-center shrink-0">
                                        <IconFile className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                      <div
                                        className="flex-1 min-w-0 cursor-pointer"
                                        onClick={() =>
                                          VIEWABLE_EXT.test(file.url)
                                            ? window.open(
                                                file.url,
                                                "_blank",
                                                "noopener,noreferrer",
                                              )
                                            : triggerDownload(file.url, name)
                                        }
                                      >
                                        <p className="text-xs font-medium truncate">
                                          {name}
                                        </p>
                                        {file.size && (
                                          <p className="text-[10px] text-muted-foreground">
                                            {fmtSize(file.size)}
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover/file:opacity-100 transition-opacity shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          onClick={() =>
                                            triggerDownload(file.url, name)
                                          }
                                        >
                                          <IconDownload className="h-3.5 w-3.5" />
                                        </Button>
                                        {canManage && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() =>
                                              void removeFile(
                                                files.indexOf(file),
                                              )
                                            }
                                          >
                                            <IconTrash className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </Section>
                    </div>
                  </div>
                </ScrollArea>
              )}

              {/* ── Comments tab ── */}
              {activeTab === "comments" && (
                <div className="h-full flex flex-col min-h-0 px-4 py-3">
                  <TaskComments
                    taskId={task.id}
                    currentUserId={userId}
                    currentUserName={userName}
                    currentUserRole={userRole}
                    assignedTo={task.assigned_to ?? null}
                    qaAssignedTo={task.qa_assigned_to ?? null}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
