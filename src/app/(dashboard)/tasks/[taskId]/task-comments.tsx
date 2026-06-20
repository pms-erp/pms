"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  IconPaperclip,
  IconSend,
  IconTrash,
  IconDownload,
  IconX,
  IconEye,
  IconMessageCircle,
  IconLoader,
  IconCheck,
  IconAlertCircle,
  IconEdit,
  IconPlus,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent as PreviewDialogContent,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { commentEvents, notificationEvents } from "@/lib/events";
import DOMPurify from "dompurify";
import RichTextEditor from "@/components/rich-text-editor";
import { uploadFile as uploadFileFn, deleteFile } from "@/lib/upload-file";
import { useTaskRealtime } from "@/hooks/use-task-realtime";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CommentAttachment {
  url: string;
  public_id: string;
  name: string;
  original_name?: string;
  size?: number;
  resource_type?: string;
  storage?: "cloudinary" | "r2";
}

interface PendingFile {
  file: File;
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  attachment?: CommentAttachment;
  error?: string;
}

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  note: string;
  note_type: "COMMENT" | "APPROVAL" | "REJECTION" | "FEEDBACK_IMAGE";
  metadata: string | null;
  created_at: string | Date;
  userName: string | null;
  userUsername: string | null;
  userRole: string | null;
}

interface TaskCommentsProps {
  taskId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  assignedTo?: string | null;
  qaAssignedTo?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayLabel(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function dayKey(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-rose-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return colors[h % colors.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const VIEWABLE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|webm|mov)$/i;

function parseAttachments(meta: string | null): CommentAttachment[] {
  if (!meta) return [];
  try {
    const p: unknown = JSON.parse(meta);
    if (!Array.isArray(p)) return [];
    return (p as Partial<CommentAttachment>[]).map((att) => ({
      url: att.url ?? "",
      public_id: att.public_id ?? "",
      name: att.name ?? "File",
      original_name: att.original_name,
      size: att.size,
      resource_type: att.resource_type,
    }));
  } catch {
    return [];
  }
}

// ─── AttachThumb ──────────────────────────────────────────────────────────────
function AttachThumb({
  pendingFile,
  onRemove,
}: {
  pendingFile: PendingFile;
  onRemove: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const { file, status, progress, error } = pendingFile;

  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    queueMicrotask(() => setSrc(url));
    return () => {
      URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [file]);

  return (
    <div className="relative group/t shrink-0">
      <div className="relative">
        {src ? (
          <img
            src={src}
            alt={file.name}
            className="h-14 w-14 object-cover rounded-xl border shadow-sm"
          />
        ) : (
          <div className="h-14 w-14 flex flex-col items-center justify-center bg-muted rounded-xl border gap-0.5 px-1">
            <IconPaperclip className="h-4 w-4 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground font-medium uppercase leading-none">
              {file.name.split(".").pop()}
            </span>
          </div>
        )}
        <div className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 shadow-sm">
          {status === "uploading" && (
            <IconLoader className="h-3 w-3 animate-spin text-blue-500" />
          )}
          {status === "uploaded" && (
            <IconCheck className="h-3 w-3 text-green-500" />
          )}
          {status === "error" && (
            <IconAlertCircle className="h-3 w-3 text-red-500" />
          )}
        </div>
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover/t:opacity-100 transition-opacity shadow z-10"
        >
          <IconX className="h-2.5 w-2.5" />
        </button>
      </div>
      {status === "uploading" && (
        <Progress value={progress} className="h-1 mt-1" />
      )}
      <p className="text-[9px] text-muted-foreground text-center truncate w-14 mt-0.5">
        {fmtSize(file.size)}
      </p>
      {status === "error" && error && (
        <p className="text-[8px] text-red-500 text-center truncate w-14 mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── CommentBubble ────────────────────────────────────────────────────────────
function CommentBubble({
  comment,
  currentUserId,
  currentUserRole,
  onDelete,
  onEdit,
  onPreview,
}: {
  comment: Comment;
  currentUserId: string;
  currentUserRole: string;
  onDelete: (id: string) => void;
  onEdit: (
    id: string,
    newNote: string,
    newAttachments: CommentAttachment[],
    removedAttachments: CommentAttachment[],
  ) => Promise<void>;
  onPreview: (url: string) => void;
}) {
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.note);
  const [saving, setSaving] = useState(false);
  const [existingAtts, setExistingAtts] = useState<CommentAttachment[]>([]);
  const [removedAtts, setRemovedAtts] = useState<CommentAttachment[]>([]);
  const [editPending, setEditPending] = useState<PendingFile[]>([]);

  const isOwn = comment.user_id === currentUserId;
  const isOptimistic = comment.id.startsWith("temp-");
  const canDelete =
    isOwn ||
    ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"].includes(currentUserRole);
  const canEdit = isOwn && !isOptimistic;
  const attachments = parseAttachments(comment.metadata);
  const name = comment.userName ?? comment.userUsername ?? "User";

  function isHtmlEmpty(html: string) {
    if (!html) return true;
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent?.trim().length === 0;
  }

  const hasText = !isHtmlEmpty(comment.note);

  const enterEditMode = () => {
    setEditContent(comment.note);
    setExistingAtts(parseAttachments(comment.metadata));
    setRemovedAtts([]);
    setEditPending([]);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditContent(comment.note);
    setExistingAtts([]);
    setRemovedAtts([]);
    setEditPending([]);
    setIsEditing(false);
  };

  const removeExistingAtt = (publicId: string) => {
    setExistingAtts((prev) => {
      const removed = prev.find((a) => a.public_id === publicId);
      if (removed) setRemovedAtts((r) => [...r, removed]);
      return prev.filter((a) => a.public_id !== publicId);
    });
  };

  const addEditFiles = (files: File[]) => {
    files.forEach((file) => {
      const id = `edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const pending: PendingFile = {
        file,
        id,
        status: "uploading",
        progress: 0,
      };
      setEditPending((prev) => [...prev, pending]);

      uploadFileFn(file, (pct) => {
        setEditPending((prev) =>
          prev.map((p) => (p.id === id ? { ...p, progress: pct } : p)),
        );
      })
        .then((d) => {
          const attachment: CommentAttachment = {
            url: d.url,
            public_id: d.public_id,
            name: d.name,
            original_name: d.original_name,
            size: d.size,
            resource_type: d.resource_type,
            storage: d.storage,
          };
          setEditPending((prev) =>
            prev.map((p) =>
              p.id === id
                ? { ...p, status: "uploaded", progress: 100, attachment }
                : p,
            ),
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setEditPending((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, status: "error", error: msg } : p,
            ),
          );
          toast.error(`Failed to upload ${file.name}`);
        });
    });
  };

  const handleSaveEdit = async () => {
    const hasUploading = editPending.some((p) => p.status === "uploading");
    if (hasUploading) {
      toast.info("Wait for uploads to finish");
      return;
    }
    if (
      isHtmlEmpty(editContent) &&
      existingAtts.length === 0 &&
      !editPending.some((p) => p.status === "uploaded")
    ) {
      toast.error("Comment cannot be empty");
      return;
    }
    const newAtts = editPending
      .filter((p) => p.status === "uploaded" && p.attachment)
      .map((p) => p.attachment!);
    const allAtts = [...existingAtts, ...newAtts];
    setSaving(true);
    try {
      await onEdit(comment.id, editContent, allAtts, removedAtts);
      setIsEditing(false);
      toast.success("Comment updated");
    } catch {
      toast.error("Failed to update comment");
    } finally {
      setSaving(false);
    }
  };

  const triggerDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(blob),
        download: filename,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className={`flex gap-2.5 group ${isOwn ? "flex-row-reverse" : ""} ${isOptimistic ? "opacity-55" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="shrink-0 mt-0.5">
        <Avatar className="h-7 w-7">
          <AvatarFallback
            className={`text-white text-[10px] font-bold ${avatarColor(name)}`}
          >
            {initials(name)}
          </AvatarFallback>
        </Avatar>
      </div>

      <div
        className={`flex flex-col gap-1 min-w-0 max-w-[75%] relative ${isOwn ? "items-end" : "items-start"}`}
      >
        <div
          className={`flex items-center gap-1.5 ${isOwn ? "flex-row-reverse" : ""}`}
        >
          <span className="text-[11px] font-semibold text-foreground/80">
            {name}
          </span>
          {comment.userRole && (
            <span className="text-[10px] px-1.5 py-px rounded-full bg-muted text-muted-foreground capitalize">
              {comment.userRole.replace(/_/g, " ").toLowerCase()}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/50">
            {isOptimistic ? "Sending…" : timeAgo(comment.created_at)}
          </span>
        </div>

        {!isOptimistic && hovered && !isEditing && (
          <div
            className={`absolute top-0 flex items-center gap-1 ${isOwn ? "-left-14" : "-right-14"} z-20`}
          >
            {canEdit && (
              <button
                onClick={enterEditMode}
                title="Edit comment"
                className="bg-background border shadow rounded-full h-6 w-6 flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors"
              >
                <IconEdit className="h-3 w-3" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => {
                  setDeleting(true);
                  onDelete(comment.id);
                }}
                disabled={deleting}
                title="Delete comment"
                className="bg-background border shadow rounded-full h-6 w-6 flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
              >
                {deleting ? (
                  <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  <IconTrash className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="w-full min-w-[300px] space-y-2">
            <RichTextEditor content={editContent} onChange={setEditContent} />
            {existingAtts.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-0.5">
                  Current attachments
                </p>
                <div className="flex flex-wrap gap-2">
                  {existingAtts.map((att) => {
                    const isImg = IMAGE_EXT.test(att.url);
                    const displayName = att.original_name ?? att.name;
                    return (
                      <div key={att.public_id} className="relative group/ea">
                        {isImg ? (
                          <div className="relative">
                            <img
                              src={att.url}
                              alt={displayName}
                              className="h-14 w-14 object-cover rounded-xl border shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeExistingAtt(att.public_id)}
                              className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover/ea:opacity-100 transition-opacity z-10"
                            >
                              <IconX className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted rounded-lg border pr-7 relative max-w-[160px]">
                            <IconPaperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs truncate">
                              {displayName}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeExistingAtt(att.public_id)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <IconX className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {editPending.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide px-0.5">
                  New attachments
                </p>
                <div className="flex flex-wrap gap-2">
                  {editPending.map((pf) => (
                    <AttachThumb
                      key={pf.id}
                      pendingFile={pf}
                      onRemove={() =>
                        setEditPending((prev) =>
                          prev.filter((p) => p.id !== pf.id),
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            <div
              className={`flex items-center gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <input
                ref={editFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addEditFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => editFileInputRef.current?.click()}
                disabled={saving}
              >
                <IconPlus className="h-3 w-3" />
                Add files
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={handleSaveEdit}
                disabled={
                  saving || editPending.some((p) => p.status === "uploading")
                }
              >
                {saving ? (
                  <IconLoader className="h-3 w-3 animate-spin" />
                ) : (
                  <IconCheck className="h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            {hasText && (
              <div
                className={`relative px-3.5 py-2 text-sm leading-relaxed break-words rounded-2xl shadow-sm ${
                  isOwn
                    ? "bg-blue-600 text-white rounded-tr-[4px]"
                    : "bg-muted/80 dark:bg-muted/50 text-foreground rounded-tl-[4px]"
                }`}
              >
                <div
                  className={`rich-text-content [&_p]:mb-1 [&_p:last-child]:mb-0 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-1 [&_strong]:font-bold [&_em]:italic [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:px-1 [&_code]:rounded ${
                    isOwn
                      ? "[&_a]:text-blue-200 [&_code]:bg-blue-700 [&_blockquote]:border-blue-400"
                      : "[&_a]:text-blue-500 [&_code]:bg-muted [&_blockquote]:border-muted"
                  }`}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(comment.note, {
                      ALLOWED_TAGS: [
                        "p",
                        "br",
                        "strong",
                        "em",
                        "u",
                        "ul",
                        "ol",
                        "li",
                        "h1",
                        "h2",
                        "h3",
                        "blockquote",
                        "code",
                        "pre",
                        "a",
                        "strike",
                      ],
                      ALLOWED_ATTR: ["href", "target", "rel"],
                    }),
                  }}
                />
              </div>
            )}
            {attachments.length > 0 && (
              <div
                className={`flex flex-wrap gap-2 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}
              >
                {attachments.map((att, i) => {
                  const isImg = IMAGE_EXT.test(att.url);
                  const displayName =
                    att.original_name ?? att.name ?? `attachment-${i + 1}`;
                  if (isImg) {
                    return (
                      <div
                        key={att.public_id || i}
                        className="relative group/img cursor-pointer rounded-xl overflow-hidden border shadow-sm"
                        style={{ width: 128, height: 128 }}
                        onClick={() => onPreview(att.url)}
                      >
                        <img
                          src={att.url}
                          alt={att.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                          <IconEye className="h-5 w-5 text-white opacity-0 group-hover/img:opacity-100 drop-shadow transition-opacity" />
                        </div>
                        <button
                          className="absolute bottom-1.5 right-1.5 bg-black/50 hover:bg-black/80 rounded-full p-1 opacity-0 group-hover/img:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDownload(att.url, displayName);
                          }}
                        >
                          <IconDownload className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={att.public_id || i}
                      className="flex items-center gap-2 px-3 py-2 bg-muted/60 hover:bg-muted rounded-xl border cursor-pointer transition-colors"
                      onClick={() =>
                        VIEWABLE_EXT.test(att.url)
                          ? window.open(
                              att.url,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          : triggerDownload(att.url, displayName)
                      }
                    >
                      <IconPaperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[130px]">
                          {displayName}
                        </p>
                        {att.size && (
                          <p className="text-[10px] text-muted-foreground">
                            {fmtSize(att.size)}
                          </p>
                        )}
                      </div>
                      <IconDownload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TaskComments({
  taskId,
  currentUserId,
  currentUserName,
  currentUserRole,
  assignedTo,
  qaAssignedTo,
}: TaskCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const latestCommentIdRef = useRef<string | null>(null);

  const fetchingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchComments = useCallback(
    async (scrollToBottom = false, signal?: AbortSignal) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const res = await fetch(`/api/tasks/${taskId}/notes`, { signal });
        if (!res.ok || res.status === 0) return;
        const data = (await res.json()) as { comments: Comment[] };
        const filtered = data.comments.filter(
          (c) => c.note_type === "COMMENT" || c.note_type === "FEEDBACK_IMAGE",
        );
        setComments(() => {
          const latestId = filtered[filtered.length - 1]?.id ?? null;
          const hasNew = latestId !== latestCommentIdRef.current;
          if (hasNew) {
            latestCommentIdRef.current = latestId;
            if (scrollToBottom)
              requestAnimationFrame(() => scrollListToBottom("smooth"));
          }
          return filtered;
        });
        setLoading(false);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setLoading(false);
      } finally {
        fetchingRef.current = false;
      }
    },
    [taskId],
  );

  const debouncedFetch = useCallback(
    (scrollToBottom = false) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => fetchComments(scrollToBottom),
        400,
      );
    },
    [fetchComments],
  );

  // ── Initial fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetchComments(false, controller.signal);
    return () => {
      controller.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchComments]);

  // ── SSE: server pushes when a comment is posted — replaces 30s poll ───────
  useTaskRealtime(taskId, { onCommentUpdate: () => debouncedFetch(true) });

  // ── commentEvents: same-page optimistic comment posted ────────────────────
  useEffect(() => {
    const unsub = commentEvents.onCommentPosted((id) => {
      if (id === taskId) debouncedFetch(true);
    });
    return () => unsub();
  }, [taskId, debouncedFetch]);

  // ── notificationEvents: relevant notification arrived ─────────────────────
  useEffect(() => {
    const unsub = notificationEvents.onNotificationReceived((type) => {
      if (!type || type === "COMMENT" || type === "TASK_COMPLETED")
        debouncedFetch(true);
    });
    return () => unsub();
  }, [debouncedFetch]);

  // ── Visibility change: refetch once when tab regains focus ────────────────
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === "visible") debouncedFetch(false);
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [debouncedFetch]);

  const scrollListToBottom = (behavior: ScrollBehavior = "smooth") => {
    const c = bottomRef.current?.parentElement;
    if (c) c.scrollTop = c.scrollHeight;
  };

  useEffect(() => {
    if (!loading) scrollListToBottom("instant");
  }, [loading]);

  // Paste images globally
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "TEXTAREA" ||
        t.tagName === "INPUT" ||
        t.closest('[contenteditable="true"]')
      )
        return;
      const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!pasted.length) return;
      e.preventDefault();
      addFiles(pasted);
      toast.info(
        `${pasted.length} image${pasted.length > 1 ? "s" : ""} pasted — uploading...`,
      );
    };
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  }, []);

  const addFiles = (incoming: File[]) => {
    const names = new Set(pendingFiles.map((p) => p.file.name));
    const toAdd = incoming.filter((f) => !names.has(f.name));
    if (!toAdd.length) {
      toast.error("File(s) already added");
      return;
    }

    toAdd.forEach((file) => {
      const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setPendingFiles((prev) => [
        ...prev,
        { file, id, status: "uploading", progress: 0 },
      ]);

      uploadFileFn(file, (pct) => {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, progress: pct } : p)),
        );
      })
        .then((d) => {
          const attachment: CommentAttachment = {
            url: d.url,
            public_id: d.public_id,
            name: d.name,
            original_name: d.original_name,
            size: d.size,
            resource_type: d.resource_type,
            storage: d.storage,
          };
          setPendingFiles((prev) =>
            prev.map((p) =>
              p.id === id
                ? { ...p, status: "uploaded", progress: 100, attachment }
                : p,
            ),
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setPendingFiles((prev) =>
            prev.map((p) =>
              p.id === id ? { ...p, status: "error", error: msg } : p,
            ),
          );
          toast.error(`Failed to upload ${file.name}`);
        });
    });

    toast.success(
      `Uploading ${toAdd.length} file${toAdd.length > 1 ? "s" : ""}...`,
    );
  };

  const handleEdit = async (
    commentId: string,
    newNote: string,
    newAttachments: CommentAttachment[],
    removedAttachments: CommentAttachment[],
  ) => {
    const res = await fetch(`/api/tasks/${taskId}/notes/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: newNote,
        metadata:
          newAttachments.length > 0 ? JSON.stringify(newAttachments) : null,
      }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error((e as { error?: string }).error ?? "Failed to update");
    }
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              note: newNote,
              metadata:
                newAttachments.length > 0
                  ? JSON.stringify(newAttachments)
                  : null,
            }
          : c,
      ),
    );

    // Fire-and-forget: delete removed attachments from storage
    removedAttachments.forEach((att) => {
      deleteFile({
        public_id: att.public_id,
        resource_type: att.resource_type,
        storage: att.storage,
        url: att.url,
      }).catch((err) =>
        console.warn("Storage delete failed for:", att.public_id, err),
      );
    });
  };

  const handleSubmit = async () => {
    const hasTextContent = text.trim().replace(/<[^>]*>/g, "").length > 0;
    const uploadedAtts = pendingFiles
      .filter((p) => p.status === "uploaded" && p.attachment)
      .map((p) => p.attachment!);
    if (!hasTextContent && !uploadedAtts.length) {
      toast.error("Add a message or wait for files to upload");
      return;
    }
    if (submitting) return;
    if (pendingFiles.some((p) => p.status === "uploading")) {
      toast.info("Wait for files to finish uploading...");
      return;
    }

    const savedText = text.trim();
    setText("");
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      task_id: taskId,
      user_id: currentUserId,
      note: savedText,
      note_type: uploadedAtts.length > 0 ? "FEEDBACK_IMAGE" : "COMMENT",
      metadata: null,
      created_at: new Date().toISOString(),
      userName: currentUserName,
      userUsername: null,
      userRole: currentUserRole,
    };
    setComments((prev) => [...prev, optimistic]);
    requestAnimationFrame(() => scrollListToBottom("smooth"));
    setSubmitting(true);

    try {
      const hasImages = uploadedAtts.some((a) => IMAGE_EXT.test(a.url));
      const finalType = uploadedAtts.length > 0 ? "FEEDBACK_IMAGE" : "COMMENT";
      const res = await fetch(`/api/tasks/${taskId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: savedText,
          note_type: finalType,
          metadata:
            uploadedAtts.length > 0 ? JSON.stringify(uploadedAtts) : null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? "Failed");
      }
      const data = (await res.json()) as { comment: Comment };
      latestCommentIdRef.current = data.comment.id;
      setComments((prev) =>
        prev.map((c) => (c.id === tempId ? data.comment : c)),
      );
      requestAnimationFrame(() => scrollListToBottom("smooth"));
      commentEvents.triggerCommentPosted(taskId);
      const notifyIds = [
        ...new Set(
          [assignedTo, qaAssignedTo].filter(
            (id): id is string => !!id && id !== currentUserId,
          ),
        ),
      ];
      if (notifyIds.length > 0) {
        fetch("/api/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: notifyIds,
            pushUserIds: notifyIds,
            taskId,
            type: "TASK_COMPLETED",
            title: "New Comment",
            message: `${currentUserName} commented on task.`,
          }),
        }).catch(() => {});
        notificationEvents.triggerNotificationReceived("COMMENT");
      }
    } catch (err) {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setText(savedText);
      toast.error(
        err instanceof Error ? err.message : "Failed to post comment",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/notes?noteId=${commentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      // Delete attachments from Cloudinary / R2 in background
      const deleted = comments.find((c) => c.id === commentId);
      if (deleted?.metadata) {
        parseAttachments(deleted.metadata).forEach((att) => {
          if (att.public_id) {
            void deleteFile({
              public_id: att.public_id,
              resource_type: att.resource_type,
              url: att.url,
            });
          }
        });
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success("Comment deleted");
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  type DayGroup = { dk: string; label: string; items: Comment[] };
  const groups: DayGroup[] = [];
  for (const c of comments) {
    const dk = dayKey(c.created_at);
    const last = groups[groups.length - 1];
    if (last?.dk === dk) last.items.push(c);
    else groups.push({ dk, label: dayLabel(c.created_at), items: [c] });
  }

  const hasUploadingFiles = pendingFiles.some((p) => p.status === "uploading");
  const hasUploadedFiles = pendingFiles.some((p) => p.status === "uploaded");
  const hasTextContent = text.trim().replace(/<[^>]*>/g, "").length > 0;
  const canSubmit =
    (hasTextContent || (hasUploadedFiles && !hasUploadingFiles)) && !submitting;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-1 py-3 space-y-5 min-h-0 scroll-smooth">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center select-none pointer-events-none">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <IconMessageCircle className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No comments yet
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Start the conversation below
            </p>
          </div>
        ) : (
          groups.map(({ dk, label, items }) => (
            <div key={dk} className="space-y-3">
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap px-2.5 py-0.5 rounded-full bg-muted/50">
                  {label}
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
              <div className="space-y-3.5">
                {items.map((comment) => (
                  <CommentBubble
                    key={comment.id}
                    comment={comment}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onPreview={setPreviewUrl}
                  />
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 py-2.5 border-t bg-muted/20 shrink-0">
          {pendingFiles.map((pf) => (
            <AttachThumb
              key={pf.id}
              pendingFile={pf}
              onRemove={() =>
                setPendingFiles((prev) => prev.filter((p) => p.id !== pf.id))
              }
            />
          ))}
        </div>
      )}

      <div className="shrink-0 border-t bg-background px-3 pt-3 pb-3">
        <div className="flex items-end gap-2.5">
          <Avatar className="h-7 w-7 shrink-0 mb-1">
            <AvatarFallback
              className={`text-white text-[10px] font-bold ${avatarColor(currentUserName)}`}
            >
              {initials(currentUserName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 rounded-2xl border bg-muted/20 focus-within:bg-background focus-within:border-primary/50 focus-within:shadow-sm transition-all overflow-hidden">
            <div onKeyDown={handleKey}>
              <RichTextEditor
                content={text}
                onChange={(html) => setText(html)}
              />
            </div>
            <div className="flex items-center justify-between px-2.5 pb-2">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) addFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                  title="Attach files"
                >
                  <IconPaperclip className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {hasUploadingFiles && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <IconLoader className="h-3 w-3 animate-spin" /> Uploading...
                  </span>
                )}
                {hasUploadedFiles && !hasUploadingFiles && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <IconCheck className="h-3 w-3" /> Ready
                  </span>
                )}
                <Button
                  size="sm"
                  className="h-7 px-3 rounded-xl gap-1.5 text-xs"
                  onClick={() => void handleSubmit()}
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{" "}
                      Sending…
                    </>
                  ) : (
                    <>
                      <IconSend className="h-3.5 w-3.5" /> Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <PreviewDialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden bg-black/95">
          {previewUrl && (
            <div className="relative flex items-center justify-center min-h-[200px]">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full"
                onClick={() => setPreviewUrl(null)}
              >
                <IconX className="h-4 w-4" />
              </Button>
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-[88vh] max-w-full object-contain"
                draggable={false}
              />
            </div>
          )}
        </PreviewDialogContent>
      </Dialog>
    </div>
  );
}
