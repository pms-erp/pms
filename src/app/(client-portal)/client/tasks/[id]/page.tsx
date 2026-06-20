// src/app/(client-portal)/client/tasks/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import NextLink from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Loader2,
  FileText,
  Download,
  Calendar,
  User,
  MessageSquare,
  Paperclip,
  Image as ImageIcon,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import DOMPurify from "dompurify";

// ── Types ──────────────────────────────────────────────────────────────────
type TaskFile = {
  url: string;
  public_id: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
};

type Comment = {
  id: string;
  note: string;
  note_type?: string;
  metadata?: string | null;
  created_at: string;
  commenterName: string;
  commenterAvatar?: string | null;
};

type CommentAttachment = {
  url: string;
  public_id?: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
  storage?: "cloudinary" | "r2";
};

type Task = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  team_type: string;
  files?: string;
  projectName?: string;
  project_id: string;
  assignedUserName: string | null;
  assignedUserAvatar: string | null;
  qaAssignedUserName?: string | null;
  qaAssignedUserAvatar?: string | null;
  estimated_minutes: number | null;
  due_date?: string | Date | null;
  created_at: string | Date | null;
  rework_count?: number;
};

type TaskData = {
  task: Task | null;
};

type CommentsData = {
  comments: Comment[];
};

// ── Rich Text Display Component ──────────────────────────────────────────────
function RichTextDisplay({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  if (!content) {
    return <p className="text-sm text-muted-foreground italic">No content</p>;
  }

  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "a",
      "span",
      "div",
      "img",
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "class",
      "style",
      "src",
      "alt",
      "title",
    ],
  });

  return (
    <div
      className={`
        prose prose-sm max-w-none
        text-sm leading-relaxed
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
        [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
        [&_p]:mb-2 [&_p]:last:mb-0
        [&_p:empty]:h-4 [&_p:empty]:mb-2
        [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2
        [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
        [&_li]:mb-1
        [&_a]:text-blue-500 [&_a]:underline [&_a]:break-all
        [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:break-all
        [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-2
        [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:mb-2
        [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2
        ${className}
      `}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  IN_PROGRESS: {
    label: "In Progress",
    color: "text-blue-600 bg-blue-50 border-blue-200",
    icon: Clock,
  },
  WAITING_FOR_QA: {
    label: "In Review",
    color: "text-violet-600 bg-violet-50 border-violet-200",
    icon: AlertCircle,
  },
  APPROVED: {
    label: "Complete",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
  },
  REWORK: {
    label: "Needs Work",
    color: "text-red-600 bg-red-50 border-red-200",
    icon: RotateCcw,
  },
};

const PRIORITY_CONFIG = {
  LOW: { label: "Low", color: "text-green-600 bg-green-50 border-green-200" },
  MEDIUM: {
    label: "Medium",
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  HIGH: { label: "High", color: "text-red-600 bg-red-50 border-red-200" },
};

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;

function formatTime(minutes: number | null): string {
  if (!minutes) return "Not set";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(date: string | Date | null): string {
  if (!date) return "Not set";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Parse comment attachments from metadata ──────────────────────────────────
function parseCommentAttachments(
  metadata: string | null | undefined,
): CommentAttachment[] {
  if (!metadata) return [];
  try {
    const parsed = JSON.parse(metadata);

    // Handle different possible metadata structures
    if (Array.isArray(parsed)) {
      return parsed as CommentAttachment[];
    }

    if (parsed.attachments && Array.isArray(parsed.attachments)) {
      return parsed.attachments as CommentAttachment[];
    }

    if (parsed.files && Array.isArray(parsed.files)) {
      return parsed.files as CommentAttachment[];
    }

    // Single attachment object
    if (parsed.url) {
      return [parsed as CommentAttachment];
    }

    return [];
  } catch {
    return [];
  }
}

// ── Comment Attachment Component ─────────────────────────────────────────────
function CommentAttachmentItem({ file }: { file: CommentAttachment }) {
  const isImage = IMAGE_EXT.test(file.url);
  const name = file.original_name ?? file.name ?? "File";

  const handleDownload = async () => {
    try {
      const res = await fetch(file.url);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(file.url, "_blank", "noopener,noreferrer");
    }
  };

  if (isImage) {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <div className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
          <img
            src={file.url}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 truncate">
          {name}
        </p>
      </a>
    );
  }

  return (
    <div
      onClick={handleDownload}
      className="flex items-center gap-2 p-2 rounded-lg border bg-muted/40 hover:bg-muted/80 transition-colors cursor-pointer group"
    >
      <div className="h-7 w-7 rounded border bg-background flex items-center justify-center shrink-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{name}</p>
        {file.size && (
          <p className="text-[10px] text-muted-foreground">
            {formatFileSize(file.size)}
          </p>
        )}
      </div>
      <Download className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  );
}

// ── File Attachment Component (for task files) ───────────────────────────────
function FileAttachment({ file }: { file: TaskFile }) {
  const isImage = IMAGE_EXT.test(file.url);
  const name = file.original_name ?? file.name ?? "File";

  const handleDownload = async () => {
    try {
      const res = await fetch(file.url);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(file.url, "_blank", "noopener,noreferrer");
    }
  };

  if (isImage) {
    return (
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
          <img
            src={file.url}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">{name}</p>
      </a>
    );
  }

  return (
    <div
      onClick={handleDownload}
      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40 hover:bg-muted/80 transition-colors cursor-pointer group"
    >
      <div className="h-10 w-10 rounded-lg border bg-background flex items-center justify-center shrink-0">
        <FileText className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size ?? 0)}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────────────────────
export default function ClientTaskDetailPage() {
  const { id: taskId } = useParams<{ id: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [taskRes, commentsRes] = await Promise.all([
          fetch(`/api/client/tasks/${taskId}`),
          fetch(`/api/client/tasks/${taskId}/comments`),
        ]);

        if (!taskRes.ok) throw new Error("Task not found");

        const taskData: TaskData = await taskRes.json();
        const commentsData: CommentsData = await commentsRes.json();

        setTask(taskData.task ?? null);
        setComments(commentsData.comments ?? []);

        if (taskData.task?.files) {
          try {
            setFiles(JSON.parse(taskData.task.files));
          } catch {
            setFiles([]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load task");
      } finally {
        setLoading(false);
      }
    }

    if (taskId) fetchData();
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-black" />
          <p className="text-sm text-gray-400">Loading task…</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center space-y-3 max-w-sm">
          <div className="mx-auto h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold">Task Not Found</h2>
          <p className="text-muted-foreground text-sm">
            {error || "This task doesn't exist or you don't have access to it."}
          </p>
          <NextLink href="/client">
            <Button variant="outline" size="sm">
              ← Back to Projects
            </Button>
          </NextLink>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[task.status as keyof typeof STATUS_CONFIG];
  const priorityCfg =
    PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6 w-full min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" asChild className="mt-1 shrink-0">
            <NextLink href={`/client/${task.project_id}`}>
              <ArrowLeft className="h-5 w-5" />
            </NextLink>
          </Button>

          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight truncate">
              {task.title}
            </h1>
            {task.projectName && (
              <NextLink
                href={`/client/${task.project_id}`}
                className="text-muted-foreground mt-1 hover:text-foreground hover:underline underline-offset-4 transition-colors text-sm inline-block"
              >
                {task.projectName}
              </NextLink>
            )}
          </div>
        </div>
      </div>

      {/* Badges */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">
          {task.team_type}
        </Badge>
        <Badge variant="outline" className={priorityCfg.color}>
          {priorityCfg.label}
        </Badge>
        <Badge variant="outline" className={statusCfg.color}>
          <StatusIcon className="h-3 w-3 mr-1" />
          {statusCfg.label}
        </Badge>
        {(task.rework_count ?? 0) > 0 && (
          <Badge
            variant="outline"
            className="bg-orange-100 text-orange-700 border-orange-200"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Rework ×{task.rework_count}
          </Badge>
        )}
      </div>

      {/* 2-column layout */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* LEFT: Task Details (col-span-2) */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  Description
                </h3>
                {task.description ? (
                  <RichTextDisplay content={task.description} />
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No description provided
                  </p>
                )}
              </div>

              {/* Attachments */}
              {files.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Attachments ({files.length})
                  </h3>
                  <div className="space-y-3">
                    {(() => {
                      const imageFiles = files.filter((f) =>
                        IMAGE_EXT.test(f.url),
                      );
                      const otherFiles = files.filter(
                        (f) => !IMAGE_EXT.test(f.url),
                      );

                      return (
                        <>
                          {imageFiles.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {imageFiles.map((file, idx) => (
                                <FileAttachment key={idx} file={file} />
                              ))}
                            </div>
                          )}
                          {otherFiles.length > 0 && (
                            <div className="space-y-2">
                              {otherFiles.map((file, idx) => (
                                <FileAttachment key={idx} file={file} />
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Task Info + Comments (col-span-1) */}
        <div className="xl:col-span-1 space-y-6">
          {/* Task Information */}
          <Card>
            <CardHeader>
              <CardTitle>Task Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Assigned To */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Assigned To
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={task.assignedUserAvatar ?? undefined} />
                    <AvatarFallback className="bg-blue-600 text-white text-xs">
                      {task.assignedUserName?.[0]?.toUpperCase() ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">
                      {task.assignedUserName ?? "Unassigned"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* QA Reviewer */}
              {task.qaAssignedUserName && (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Eye className="h-4 w-4 text-purple-500" />
                      QA Reviewer
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={task.qaAssignedUserAvatar ?? undefined}
                        />
                        <AvatarFallback className="bg-purple-600 text-white text-xs">
                          {task.qaAssignedUserName
                            .split(" ")
                            .map((n: string) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {task.qaAssignedUserName}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Estimated Time */}
              {task.estimated_minutes && (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Estimated Time
                    </h3>
                    <p className="mt-2 text-sm font-medium">
                      {formatTime(task.estimated_minutes)}
                    </p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Due Date */}
              {task.due_date && (
                <>
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Due Date
                    </h3>
                    <p className="mt-2 text-sm">{formatDate(task.due_date)}</p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Created */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Created
                </h3>
                <p className="mt-2 text-sm">{formatDate(task.created_at)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Comments - NOW ON RIGHT SIDE */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Updates & Comments
                {comments.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {comments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    No comments yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Updates and feedback will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {comments.map((comment) => {
                    const attachments = parseCommentAttachments(
                      comment.metadata,
                    );

                    return (
                      <div key={comment.id} className="flex gap-3">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage
                            src={comment.commenterAvatar ?? undefined}
                          />
                          <AvatarFallback className="text-xs bg-blue-600 text-white">
                            {comment.commenterName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {comment.commenterName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </span>
                          </div>
                          <RichTextDisplay content={comment.note} />

                          {/* Comment Attachments */}
                          {attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Paperclip className="h-3 w-3" />
                                Attachments ({attachments.length})
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {attachments.map((file, idx) => (
                                  <CommentAttachmentItem
                                    key={idx}
                                    file={file}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
