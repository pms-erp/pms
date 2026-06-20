"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  IconShieldCheck,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconUpload,
  IconPlus,
  IconPaperclip,
  IconDownload,
  IconTrash,
  IconPhoto,
  IconExternalLink,
  IconClockHour4,
  IconEdit,
  IconChevronLeft,
  IconChevronRight,
  IconZoomIn,
  IconZoomOut,
  IconMaximize,
  IconLoader,
} from "@tabler/icons-react";
import {
  taskEvents,
  notificationEvents,
  Task as TaskEvent,
} from "@/lib/events";
// ✅ Import your shared upload utilities
import { uploadFile, deleteFile, type UploadResult } from "@/lib/upload-file";

// ─── Types ────────────────────────────────────────────────────────────────────

// ✅ Extend your shared UploadResult type for consistency
// ✅ NEW (fixed)
// qa-review-dialog.tsx
export interface TaskFile {
  url: string;
  public_id: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
  storage?: "cloudinary" | "r2";
}

export interface TaskData {
  id: string;
  project_id: string;
  projectName?: string;
  team_type: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  assigned_to?: string;
  assignedUserName?: string;
  assignedByUsername?: string;
  qa_assigned_to?: string | null;
  estimated_minutes?: number | null;
  files?: string;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  started_at?: string | Date | null;
  rework_count?: number;
}

interface PendingAttachedFile {
  file: File;
  id: string;
  status: "uploading" | "uploaded" | "error";
  progress: number;
  preview: string | null;
  uploadedData?: UploadResult; // ✅ Use shared UploadResult type
  error?: string;
}

interface FeedbackRow {
  id: string;
  text: string;
  attached: PendingAttachedFile[];
  isDragging: boolean;
}

export interface QAReviewInlineProps {
  task: TaskData;
  userId: string;
  userName: string;
  canReview: boolean;
  onTaskUpdated: (updated: TaskData) => void;
  onTimerStop: (stopped: boolean) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
const VIEWABLE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|webm|mov)$/i;

function makeRow(): FeedbackRow {
  return { id: crypto.randomUUID(), text: "", attached: [], isDragging: false };
}

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function isImageFile(f: File): boolean {
  return f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
}

function makePendingAttached(files: File[]): PendingAttachedFile[] {
  return files.map((f) => ({
    file: f,
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    status: "uploading",
    progress: 0,
    preview: isImageFile(f) ? URL.createObjectURL(f) : null,
  }));
}

function revokeAttached(attached: PendingAttachedFile[]): void {
  attached.forEach((a) => {
    if (a.preview) URL.revokeObjectURL(a.preview);
  });
}

function timeAgo(d: string | Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(ms / 86400000)}d ago`;
}

function aColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return colors[h % colors.length];
}

// ─── Single feedback row with upload progress ─────────────────────────────────

function FeedbackRowItem({
  row,
  index,
  disabled,
  onMergeFiles,
  onRemoveAttached,
  onTextChange,
  onRemove,
  onDragChange,
  showRemove,
}: {
  row: FeedbackRow;
  index: number;
  disabled: boolean;
  onMergeFiles: (rowId: string, files: File[]) => void;
  onRemoveAttached: (rowId: string, id: string) => void;
  onTextChange: (rowId: string, text: string) => void;
  onRemove: () => void;
  onDragChange: (rowId: string, dragging: boolean) => void;
  showRemove: boolean;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextareaPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const imageFiles = Array.from(e.clipboardData.files).filter(isImageFile);
    if (!imageFiles.length) return;
    e.preventDefault();
    onMergeFiles(row.id, imageFiles);
    toast.info(
      `${imageFiles.length} image${imageFiles.length > 1 ? "s" : ""} uploading...`,
    );
  };

  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-xl border border-border/60">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Point {index + 1}
        </span>
        {showRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onRemove}
            disabled={disabled}
          >
            <IconTrash className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="relative">
        <Textarea
          placeholder={
            index === 0
              ? "Describe the issue… (paste images directly here)"
              : "Add another point… (paste images here)"
          }
          value={row.text}
          onChange={(e) => onTextChange(row.id, e.target.value)}
          onPaste={handleTextareaPaste}
          rows={3}
          disabled={disabled}
          className="resize-none bg-background text-sm pr-8"
        />
        <IconPhoto className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground/25 pointer-events-none" />
      </div>

      {/* Attached file chips with upload status */}
      {row.attached.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {row.attached.map((a) => (
            <div
              key={a.id}
              className={`relative group/chip flex items-center border rounded-xl overflow-hidden shadow-sm ${
                a.status === "error"
                  ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
                  : a.status === "uploaded"
                    ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                    : "bg-background border-border"
              }`}
            >
              {a.preview ? (
                <div className="relative w-16 h-16 shrink-0">
                  <img
                    src={a.preview}
                    alt={a.file.name}
                    className="w-full h-full object-cover opacity-80"
                  />
                  {/* Status overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    {a.status === "uploading" && (
                      <IconLoader className="h-5 w-5 text-white animate-spin" />
                    )}
                    {a.status === "uploaded" && (
                      <IconCheck className="h-5 w-5 text-green-400" />
                    )}
                    {a.status === "error" && (
                      <IconAlertTriangle className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                  <div className="absolute bottom-0.5 left-0.5">
                    <span className="text-[8px] bg-black/60 text-white rounded px-1">
                      {fmtSize(a.file.size)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-2">
                  <IconPaperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[110px]">
                      {a.file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {fmtSize(a.file.size)}
                    </p>
                  </div>
                </div>
              )}

              {/* Progress bar for uploading */}
              {a.status === "uploading" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${a.progress}%` }}
                  />
                </div>
              )}

              {/* Remove button */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemoveAttached(row.id, a.id)}
                className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity z-10"
              >
                <IconX className="h-2.5 w-2.5" />
              </button>

              {/* Error tooltip */}
              {a.status === "error" && a.error && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover/chip:opacity-100 transition-opacity pointer-events-none">
                  {a.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        ref={dropRef}
        className={`border-2 border-dashed rounded-xl transition-colors cursor-pointer select-none ${
          row.isDragging
            ? "border-purple-400 bg-purple-50 dark:bg-purple-950/20"
            : "border-muted-foreground/20 hover:border-purple-300 bg-background/60"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          onDragChange(row.id, true);
        }}
        onDragLeave={(e) => {
          if (!dropRef.current?.contains(e.relatedTarget as Node))
            onDragChange(row.id, false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDragChange(row.id, false);
          onMergeFiles(row.id, Array.from(e.dataTransfer.files));
        }}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,video/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files)
              onMergeFiles(row.id, Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
          <IconUpload className="h-3.5 w-3.5 shrink-0" />
          <span className="text-xs">
            <span className="text-purple-600 dark:text-purple-400 font-medium">
              Browse
            </span>
            {" or drag & drop · paste images"}
            {row.attached.length > 0 && (
              <span className="ml-1 font-medium text-purple-600 dark:text-purple-400">
                · {row.attached.filter((a) => a.status === "uploaded").length}/
                {row.attached.length} ready
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────

interface LightboxProps {
  images: TaskFile[];
  startIndex: number;
  onClose: () => void;
  onDownload: (url: string, name: string) => void;
}

export function ImageLightbox({
  images,
  startIndex,
  onClose,
  onDownload,
}: LightboxProps) {
  const [current, setCurrent] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  const go = (dir: 1 | -1) => {
    setCurrent((c) => (c + dir + images.length) % images.length);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const toggleZoom = () => {
    setZoom((z) => (z === 1 ? 2 : 1));
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "+") setZoom((z) => Math.min(z + 0.5, 4));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [images.length]);

  const f = images[current];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-white/20" />
            <span className="text-sm font-medium text-white/90">
              {f.name ?? `Image ${current + 1}`}
            </span>
          </div>
          {images.length > 1 && (
            <span className="text-xs text-white/40 font-mono">
              {current + 1} / {images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
            disabled={zoom <= 1}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom out (−)"
          >
            <IconZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleZoom}
            className="px-2.5 py-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-xs font-mono transition-colors min-w-[48px] text-center"
            title="Toggle zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(z + 0.5, 4))}
            disabled={zoom >= 4}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom in (+)"
          >
            <IconZoomIn className="h-4 w-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={() => onDownload(f.url, f.name ?? "image")}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Download"
          >
            <IconDownload className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => window.open(f.url, "_blank", "noopener,noreferrer")}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Open original"
          >
            <IconMaximize className="h-4 w-4" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Close (Esc)"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0">
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-4 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          className="flex items-center justify-center w-full h-full p-4"
          style={{
            cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "default",
          }}
          onMouseDown={(e) => {
            if (zoom <= 1) return;
            setDragging(true);
            setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
          }}
          onMouseMove={(e) => {
            if (!dragging) return;
            setOffset({
              x: e.clientX - dragStart.x,
              y: e.clientY - dragStart.y,
            });
          }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          onDoubleClick={toggleZoom}
        >
          <img
            ref={imgRef}
            src={f.url}
            alt={f.name ?? "image"}
            className="max-h-full max-w-full object-contain select-none transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) translate(${offset.x / zoom}px, ${offset.y / zoom}px)`,
              transformOrigin: "center",
            }}
            draggable={false}
          />
        </div>

        {images.length > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-4 z-10 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors border border-white/10"
          >
            <IconChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div className="shrink-0 border-t border-white/10 bg-black/60 px-4 py-3">
          <div className="flex gap-2 justify-center overflow-x-auto">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setCurrent(i);
                  setZoom(1);
                  setOffset({ x: 0, y: 0 });
                }}
                className={`shrink-0 h-14 w-20 rounded-md overflow-hidden border-2 transition-all ${
                  i === current
                    ? "border-white opacity-100 scale-105"
                    : "border-white/20 opacity-50 hover:opacity-80"
                }`}
              >
                <img
                  src={img.url}
                  alt={img.name ?? `img ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="shrink-0 flex justify-center gap-4 pb-2 pt-1">
        {[images.length > 1 && "← → Navigate", "Double-click Zoom", "Esc Close"]
          .filter(Boolean)
          .map((hint) => (
            <span
              key={hint as string}
              className="text-[10px] text-white/20 tracking-wide"
            >
              {hint}
            </span>
          ))}
      </div>
    </div>
  );
}

// ─── Image Gallery Grid ───────────────────────────────────────────────────────

export function ImageGalleryGrid({
  images,
  onDownload,
  onPreview,
  onRemove,
}: {
  images: TaskFile[];
  onDownload: (url: string, name: string) => void;
  onPreview?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openAt = (i: number) => {
    if (onPreview) onPreview(i);
    else setLightboxIndex(i);
  };

  if (images.length === 0) return null;

  const isSingle = images.length === 1;
  const isDouble = images.length === 2;
  const isTriple = images.length === 3;
  const hasMore = images.length > 4;
  const visible = hasMore ? images.slice(0, 4) : images;
  const extraCount = images.length - 4;

  return (
    <>
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onDownload={onDownload}
        />
      )}

      <div
        className={`grid gap-1.5 rounded-xl overflow-hidden ${
          isSingle
            ? "grid-cols-1"
            : isDouble
              ? "grid-cols-2"
              : isTriple
                ? "grid-cols-3"
                : "grid-cols-2"
        }`}
      >
        {visible.map((f, i) => {
          const isLast = hasMore && i === 3;
          return (
            <div
              key={i}
              className={`relative group/thumb cursor-pointer overflow-hidden bg-muted ${
                isSingle
                  ? "aspect-video max-h-72"
                  : isDouble
                    ? "aspect-video"
                    : isTriple
                      ? "aspect-square"
                      : i === 0
                        ? "row-span-2 aspect-auto"
                        : "aspect-square"
              }`}
              onClick={() => openAt(isLast ? 3 : i)}
            >
              <img
                src={f.url}
                alt={f.name ?? `image ${i + 1}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
              />

              <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/30 transition-colors" />

              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(f.url, f.name ?? "image");
                  }}
                  className="p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white"
                  title="Download"
                >
                  <IconDownload className="h-3 w-3" />
                </button>
                {onRemove && !isLast && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(i);
                    }}
                    className="p-1.5 rounded-lg bg-black/60 hover:bg-red-600 text-white"
                    title="Remove"
                  >
                    <IconTrash className="h-3 w-3" />
                  </button>
                )}
              </div>

              {!isLast && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
                  <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-xs font-medium px-3 py-1.5 rounded-full">
                    <IconMaximize className="h-3 w-3" />
                    View
                  </div>
                </div>
              )}

              {isLast && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm text-white">
                  <span className="text-2xl font-bold">+{extraCount + 1}</span>
                  <span className="text-xs text-white/70 mt-0.5">more</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => openAt(0)}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-1"
      >
        <IconPhoto className="h-3 w-3" />
        {images.length} image{images.length > 1 ? "s" : ""} — click to view all
      </button>
    </>
  );
}

// ─── QA Review Inline with Library Upload Integration ─────────────────────────

export function QAReviewInline({
  task,
  userId,
  userName,
  canReview,
  onTaskUpdated,
  onTimerStop,
}: QAReviewInlineProps) {
  const [rows, setRows] = useState<FeedbackRow[]>([makeRow()]);
  const [submitting, setSubmitting] = useState<"APPROVED" | "REWORK" | null>(
    null,
  );
  const [feedbackKey, setFeedbackKey] = useState(0);
  const isSubmitting = submitting !== null;

  // ── Real-time: refresh QA feedback when task updates on any device ─────────
  useEffect(() => {
    const unsubTask = taskEvents.onTaskUpdated((updated) => {
      if (updated.id === task.id) setFeedbackKey((k) => k + 1);
    });
    const unsubNotif = notificationEvents.onNotificationReceived(() => {
      setFeedbackKey((k) => k + 1);
    });
    return () => {
      unsubTask();
      unsubNotif();
    };
  }, [task.id]);

  const resetForm = () => {
    setRows((prev) => {
      prev.forEach((r) => revokeAttached(r.attached));
      return [makeRow()];
    });
  };

  // ✅ UPLOAD: Use shared uploadFile utility with real progress
  // ✅ FIXED: Only update the specific file by ID, don't re-map all files
  const uploadFileWithProgress = async (
    file: File,
    rowId: string,
    fileId: string, // ✅ Use the captured ID from makePendingAttached
  ): Promise<void> => {
    try {
      const result = await uploadFile(file, (pct) => {
        setRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  attached: r.attached.map(
                    (a) => (a.id === fileId ? { ...a, progress: pct } : a), // ✅ Match by ID, not index
                  ),
                }
              : r,
          ),
        );
      });

      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                attached: r.attached.map((a) =>
                  a.id === fileId // ✅ Match by ID
                    ? {
                        ...a,
                        status: "uploaded",
                        progress: 100,
                        uploadedData: result,
                      }
                    : a,
                ),
              }
            : r,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                attached: r.attached.map(
                  (a) =>
                    a.id === fileId ? { ...a, status: "error", error: msg } : a, // ✅ Match by ID
                ),
              }
            : r,
        ),
      );
      toast.error(`Failed to upload ${file.name}`, { description: msg });
    }
  };

  // ✅ FIXED: Create pending items first, capture their IDs, then trigger uploads
  const onMergeFiles = (rowId: string, incoming: File[]) => {
    // Deduplicate and prepare files first
    const preparedFiles = incoming.map((f) => {
      let file = f;
      const existingNames = new Set(
        rows.flatMap((r) => r.attached.map((a) => a.file.name)),
      );

      if (existingNames.has(f.name)) {
        const dot = f.name.lastIndexOf(".");
        const base = dot > 0 ? f.name.slice(0, dot) : f.name;
        const ext = dot > 0 ? f.name.slice(dot) : "";
        const unique = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
        file = new File([f], unique, { type: f.type });
      }
      return file;
    });

    // Create pending items WITH their IDs captured BEFORE state update
    const pendingItems = makePendingAttached(preparedFiles);
    const pendingMap = new Map(pendingItems.map((p) => [p.file.name, p.id]));

    // Update state ONCE with all new pending items
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return { ...r, attached: [...r.attached, ...pendingItems] };
      }),
    );

    // Trigger uploads using the CAPTURED IDs (no state lookup needed)
    preparedFiles.forEach((file, idx) => {
      const fileId = pendingMap.get(file.name)!;
      setTimeout(() => {
        void uploadFileWithProgress(file, rowId, fileId);
      }, idx * 100); // Stagger to avoid network congestion
    });
  };

  // ✅ REMOVE: Clean up preview + trigger storage delete via library
  const onRemoveAttached = async (rowId: string, id: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const target = r.attached.find((a) => a.id === id);

        if (target?.preview) URL.revokeObjectURL(target.preview);

        // Delete from storage if already uploaded (non-blocking)
        if (target?.status === "uploaded" && target.uploadedData?.public_id) {
          void deleteFile({
            public_id: target.uploadedData.public_id,
            resource_type: target.uploadedData.resource_type,
            storage: target.uploadedData.storage,
            url: target.uploadedData.url,
          }).catch((err) => {
            console.warn("Storage delete failed:", err);
          });
        }

        return {
          ...r,
          attached: r.attached.filter((a) => a.id !== id),
        };
      }),
    );
  };

  const onTextChange = (rowId: string, text: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, text } : r)));
  };

  const onDragChange = (rowId: string, dragging: boolean) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, isDragging: dragging } : r)),
    );
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const target = prev.find((r) => r.id === rowId);
      if (target) revokeAttached(target.attached);
      return prev.filter((r) => r.id !== rowId);
    });
  };

  const addRow = () => setRows((prev) => [...prev, makeRow()]);

  const filledRows = rows.filter(
    (r) => r.text.trim() !== "" || r.attached.length > 0,
  );
  const hasContent = filledRows.length > 0;

  const hasUploadingFiles = rows.some((r) =>
    r.attached.some((a) => a.status === "uploading"),
  );
  const hasErrorFiles = rows.some((r) =>
    r.attached.some((a) => a.status === "error"),
  );

  const fetchPrivilegedIds = async (): Promise<string[]> => {
    const [a, b, c] = await Promise.all([
      fetch("/api/users?role=ADMIN&limit=100").then((r) => r.json()),
      fetch("/api/users?role=PROJECT_MANAGER&limit=100").then((r) => r.json()),
      fetch("/api/users?role=TEAM_LEADER&limit=100").then((r) => r.json()),
    ]);
    const toIds = (res: unknown): string[] => {
      const arr = Array.isArray(res)
        ? res
        : ((res as { data?: { id: string }[]; users?: { id: string }[] })
            ?.data ??
          (res as { users?: { id: string }[] })?.users ??
          []);
      return (arr as { id: string }[]).map((u) => u.id);
    };
    return [...new Set([...toIds(a), ...toIds(b), ...toIds(c)])];
  };

  // ✅ SUBMIT: Uses pre-uploaded files from library
  const handleSubmit = async (decision: "APPROVED" | "REWORK") => {
    if (decision === "REWORK" && !hasContent) {
      toast.error("Add at least one feedback point before requesting rework.");
      return;
    }

    if (hasUploadingFiles) {
      toast.error("Please wait for all files to finish uploading.");
      return;
    }

    if (hasErrorFiles) {
      toast.error(
        "Some files failed to upload. Please remove them or try again.",
      );
      return;
    }

    setSubmitting(decision);
    const newReworkCount = (task.rework_count ?? 0) + 1;

    try {
      const toSave = hasContent
        ? filledRows
        : [
            {
              ...makeRow(),
              text: `Task approved by QA (${userName}).`,
              attached: [],
            },
          ];

      for (const row of toSave) {
        const uploadedFiles = row.attached
          .filter((a) => a.status === "uploaded" && a.uploadedData)
          .map((a) => a.uploadedData!);

        const res = await fetch(`/api/tasks/${task.id}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note:
              row.text.trim() ||
              (decision === "APPROVED"
                ? `Approved by QA (${userName}).`
                : "Sent for rework."),
            note_type: decision === "APPROVED" ? "APPROVAL" : "REJECTION",
            metadata:
              uploadedFiles.length > 0
                ? JSON.stringify({ files: uploadedFiles })
                : null,
          }),
        });
        if (!res.ok) throw new Error("Failed to save feedback");
      }

      const patchBody =
        decision === "REWORK"
          ? {
              status: decision,
              rework_count: newReworkCount,
            }
          : {
              status: decision,
            };

      const patchRes = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) throw new Error("Failed to update task status");
      const patchData = (await patchRes.json()) as { task: TaskData };

      const updatedTask: TaskData = {
        ...patchData.task,
        rework_count:
          decision === "REWORK" ? newReworkCount : patchData.task.rework_count,
        qa_assigned_to: patchData.task.qa_assigned_to,
      };

      onTaskUpdated(updatedTask);
      onTimerStop(decision === "APPROVED");
      setFeedbackKey((k) => k + 1);
      resetForm();

      const privilegedIds = await fetchPrivilegedIds();
      const assigneeId = task.assigned_to;
      const allIds = [
        ...new Set([...privilegedIds, ...(assigneeId ? [assigneeId] : [])]),
      ];

      await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: allIds,
          pushUserIds:
            decision === "APPROVED" ? allIds : assigneeId ? [assigneeId] : [],
          taskId: task.id,
          type: decision === "APPROVED" ? "TASK_APPROVED" : "TASK_REWORK",
          title:
            decision === "APPROVED"
              ? `Task Approved: ${task.title}`
              : `Rework Required: ${task.title}`,
          message:
            decision === "APPROVED"
              ? `"${task.title}" approved by QA (${userName}).`
              : `"${task.title}" sent for rework (round ${newReworkCount}). ${filledRows
                  .map((r) => r.text)
                  .filter(Boolean)
                  .join(" | ")}`,
        }),
      });

      taskEvents.triggerTaskUpdated(patchData.task as unknown as TaskEvent);
      notificationEvents.triggerNotificationReceived();

      decision === "APPROVED"
        ? toast.success("Task approved!")
        : toast.warning(`Task sent for rework (round ${newReworkCount}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-5">
      {canReview && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/50" />
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40">
              <IconShieldCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span className="text-[11px] text-purple-700 dark:text-purple-400 font-semibold uppercase tracking-wide">
                Add Review
              </span>
            </div>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          <p className="text-xs text-muted-foreground">
            Paste images directly · drag & drop · browse files · uploads start
            automatically
          </p>

          {rows.map((row, index) => (
            <FeedbackRowItem
              key={row.id}
              row={row}
              index={index}
              disabled={isSubmitting}
              onMergeFiles={onMergeFiles}
              onRemoveAttached={onRemoveAttached}
              onTextChange={onTextChange}
              onDragChange={onDragChange}
              onRemove={() => removeRow(row.id)}
              showRemove={rows.length > 1}
            />
          ))}

          <button
            type="button"
            onClick={addRow}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-muted-foreground/20 hover:border-purple-300 rounded-xl text-sm text-muted-foreground hover:text-purple-600 transition-colors disabled:opacity-40"
          >
            <IconPlus className="h-4 w-4" />
            Add another feedback point
          </button>

          <div className="flex gap-3 pt-1">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-2"
              onClick={() => void handleSubmit("APPROVED")}
              disabled={isSubmitting || hasUploadingFiles}
            >
              {submitting === "APPROVED" ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{" "}
                  Approving…
                </>
              ) : hasUploadingFiles ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" /> Waiting for
                  uploads…
                </>
              ) : (
                <>
                  <IconCheck className="h-4 w-4" /> Approve Task
                </>
              )}
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
              onClick={() => void handleSubmit("REWORK")}
              disabled={isSubmitting || !hasContent || hasUploadingFiles}
              title={
                !hasContent
                  ? "Add at least one feedback point"
                  : hasUploadingFiles
                    ? "Wait for uploads to complete"
                    : undefined
              }
            >
              {submitting === "REWORK" ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{" "}
                  Sending…
                </>
              ) : hasUploadingFiles ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" /> Waiting…
                </>
              ) : (
                <>
                  <IconAlertTriangle className="h-4 w-4" /> Request Rework
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-5 text-[11px] text-muted-foreground pb-1">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
              Approve — notes optional
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
              Rework — at least one point required
            </span>
          </div>

          <Separator className="opacity-40" />
        </div>
      )}

      <QAFeedbackFeed
        taskId={task.id}
        refreshKey={feedbackKey}
        currentUserId={userId}
      />
    </div>
  );
}

// ─── QA Feedback Feed ─────────────────────────────────────────────────────────

interface QANote {
  id: string;
  user_id?: string;
  note: string;
  note_type: "APPROVAL" | "REJECTION" | "COMMENT" | "FEEDBACK_IMAGE";
  metadata: string | null;
  created_at: string | Date;
  userName: string | null;
  userUsername: string | null;
  userRole: string | null;
}

function parseQAFiles(meta: string | null): TaskFile[] {
  if (!meta) return [];
  try {
    const p: unknown = JSON.parse(meta);
    if (typeof p === "object" && p !== null && "files" in p)
      return (p as { files: TaskFile[] }).files ?? [];
    if (Array.isArray(p)) return p as TaskFile[];
    return [];
  } catch {
    return [];
  }
}

export interface QAFeedbackFeedProps {
  taskId: string;
  refreshKey?: number;
  currentUserId?: string;
}

export function QAFeedbackFeed({
  taskId,
  refreshKey = 0,
  currentUserId,
}: QAFeedbackFeedProps) {
  const [notes, setNotes] = useState<QANote[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<FeedbackRow[]>([]);
  const [editExistingFiles, setEditExistingFiles] = useState<TaskFile[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/tasks/${taskId}/notes`);
        const d = (await r.json()) as { comments: QANote[] };
        if (!cancelled) {
          setNotes(
            d.comments.filter(
              (n) => n.note_type === "APPROVAL" || n.note_type === "REJECTION",
            ),
          );
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [taskId, refreshKey]);

  const openEdit = (note: QANote) => {
    setEditRows([
      { id: note.id, text: note.note ?? "", attached: [], isDragging: false },
    ]);
    setEditExistingFiles(parseQAFiles(note.metadata));
    setEditingId(note.id);
  };

  const closeEdit = () => {
    setEditRows((prev) => {
      prev.forEach((r) => revokeAttached(r.attached));
      return [];
    });
    setEditExistingFiles([]);
    setEditingId(null);
  };

  // ✅ EDIT MODE UPLOAD: Use shared utility
  // ✅ FIXED: Same ID-based update pattern for edit mode
  const uploadEditFile = async (
    file: File,
    rowId: string,
    fileId: string,
  ): Promise<void> => {
    try {
      const result = await uploadFile(file, (pct) => {
        setEditRows((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  attached: r.attached.map((a) =>
                    a.id === fileId ? { ...a, progress: pct } : a,
                  ),
                }
              : r,
          ),
        );
      });

      setEditRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                attached: r.attached.map((a) =>
                  a.id === fileId
                    ? {
                        ...a,
                        status: "uploaded",
                        progress: 100,
                        uploadedData: result,
                      }
                    : a,
                ),
              }
            : r,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setEditRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                attached: r.attached.map((a) =>
                  a.id === fileId ? { ...a, status: "error", error: msg } : a,
                ),
              }
            : r,
        ),
      );
    }
  };

  // ✅ FIXED: Same pattern for edit mode
  const onEditMergeFiles = (rowId: string, incoming: File[]) => {
    const preparedFiles = incoming.map((f) => {
      let file = f;
      const existingNames = new Set(
        editRows.flatMap((r) => r.attached.map((a) => a.file.name)),
      );

      if (existingNames.has(f.name)) {
        const dot = f.name.lastIndexOf(".");
        const base = dot > 0 ? f.name.slice(0, dot) : f.name;
        const ext = dot > 0 ? f.name.slice(dot) : "";
        const unique = `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`;
        file = new File([f], unique, { type: f.type });
      }
      return file;
    });

    const pendingItems = makePendingAttached(preparedFiles);
    const pendingMap = new Map(pendingItems.map((p) => [p.file.name, p.id]));

    setEditRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return { ...r, attached: [...r.attached, ...pendingItems] };
      }),
    );

    preparedFiles.forEach((file, idx) => {
      const fileId = pendingMap.get(file.name)!;
      setTimeout(() => {
        void uploadEditFile(file, rowId, fileId);
      }, idx * 100);
    });
  };

  // ✅ EDIT MODE REMOVE: Use shared delete utility
  const onEditRemoveAttached = async (rowId: string, id: string) => {
    setEditRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const target = r.attached.find((a) => a.id === id);

        if (target?.preview) URL.revokeObjectURL(target.preview);

        if (target?.status === "uploaded" && target.uploadedData?.public_id) {
          void deleteFile({
            public_id: target.uploadedData.public_id,
            resource_type: target.uploadedData.resource_type,
            storage: target.uploadedData.storage,
            url: target.uploadedData.url,
          });
        }

        return {
          ...r,
          attached: r.attached.filter((a) => a.id !== id),
        };
      }),
    );
  };

  const onEditTextChange = (rowId: string, text: string) => {
    setEditRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, text } : r)),
    );
  };

  const onEditDragChange = (rowId: string, dragging: boolean) => {
    setEditRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, isDragging: dragging } : r)),
    );
  };

  const removeEditRow = (rowId: string) => {
    setEditRows((prev) => {
      if (prev.length <= 1) return prev;
      const target = prev.find((r) => r.id === rowId);
      if (target) revokeAttached(target.attached);
      return prev.filter((r) => r.id !== rowId);
    });
  };

  const handleSaveEdit = async (
    originalNoteId: string,
    originalNoteType: string,
  ) => {
    setEditSaving(true);
    try {
      const [firstRow, ...extraRows] = editRows;

      const hasUploading = editRows.some((r) =>
        r.attached.some((a) => a.status === "uploading"),
      );
      if (hasUploading) {
        toast.error("Please wait for uploads to complete");
        setEditSaving(false);
        return;
      }

      const newUploaded = firstRow.attached
        .filter((a) => a.status === "uploaded" && a.uploadedData)
        .map((a) => a.uploadedData!);

      const mergedFiles: TaskFile[] = [...editExistingFiles, ...newUploaded];

      const res = await fetch(`/api/tasks/${taskId}/notes/${originalNoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: firstRow.text.trim(),
          metadata:
            mergedFiles.length > 0
              ? JSON.stringify({ files: mergedFiles })
              : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");

      for (const row of extraRows) {
        if (!row.text.trim() && row.attached.length === 0) continue;
        const extraUploaded = row.attached
          .filter((a) => a.status === "uploaded" && a.uploadedData)
          .map((a) => a.uploadedData!);
        await fetch(`/api/tasks/${taskId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: row.text.trim(),
            note_type: originalNoteType,
            metadata:
              extraUploaded.length > 0
                ? JSON.stringify({ files: extraUploaded })
                : null,
          }),
        });
      }

      const r = await fetch(`/api/tasks/${taskId}/notes`);
      const d = (await r.json()) as { comments: QANote[] };
      setNotes(
        d.comments.filter(
          (n) => n.note_type === "APPROVAL" || n.note_type === "REJECTION",
        ),
      );

      closeEdit();
      toast.success("Feedback updated");
    } catch {
      toast.error("Failed to update feedback");
    } finally {
      setEditSaving(false);
    }
  };

  const triggerDownload = (url: string, name: string) => {
    const href = url.includes("cloudinary.com")
      ? url.replace("/upload/", "/upload/fl_attachment/")
      : url;
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center py-10 gap-2.5 text-muted-foreground/50">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="text-xs tracking-wide">Loading review history…</span>
      </div>
    );

  if (notes.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center select-none">
        <div className="relative mb-4">
          <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center">
            <IconShieldCheck className="h-7 w-7 text-muted-foreground/25" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center">
            <IconClockHour4 className="h-3 w-3 text-muted-foreground/40" />
          </div>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          No reviews yet
        </p>
        <p className="text-xs text-muted-foreground/50 mt-1 max-w-[180px] leading-relaxed">
          QA feedback will appear here after the first review
        </p>
      </div>
    );

  return (
    <div className="relative">
      <div className="absolute left-[18px] top-6 bottom-6 w-px bg-gradient-to-b from-border via-border/60 to-transparent" />

      <div className="space-y-4">
        {notes.map((note, idx) => {
          const files = parseQAFiles(note.metadata);
          const imgFiles = files.filter((f) => IMAGE_EXT.test(f.url));
          const otherFiles = files.filter((f) => !IMAGE_EXT.test(f.url));
          const isApproval = note.note_type === "APPROVAL";
          const name = note.userName ?? note.userUsername ?? "QA";
          const initials = name
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const isOwner = currentUserId && note.user_id === currentUserId;
          const isEditing = editingId === note.id;
          const roundNumber = notes.length - idx;

          return (
            <div key={note.id} className="flex gap-3 relative">
              <div
                className="shrink-0 flex flex-col items-center"
                style={{ width: 36 }}
              >
                <div
                  className={`h-9 w-9 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border-2 border-background z-10 ${
                    isApproval ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                >
                  {isApproval ? (
                    <IconCheck className="h-4 w-4" />
                  ) : (
                    <span>R{roundNumber}</span>
                  )}
                </div>
              </div>

              <div
                className={`flex-1 min-w-0 rounded-xl border overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
                  isApproval
                    ? "border-emerald-200/70 dark:border-emerald-800/50"
                    : "border-rose-200/70 dark:border-rose-800/50"
                }`}
              >
                <div
                  className={`flex items-start gap-0 ${
                    isApproval
                      ? "bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-950/20"
                      : "bg-gradient-to-r from-rose-50 to-transparent dark:from-rose-950/20"
                  }`}
                >
                  <div
                    className={`w-1 self-stretch shrink-0 ${isApproval ? "bg-emerald-500" : "bg-rose-500"}`}
                  />

                  <div className="flex items-center gap-2.5 px-3 py-2.5 flex-1 min-w-0">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback
                        className={`text-white text-[10px] font-bold ${aColor(name)}`}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold leading-none">
                          {name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isApproval
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                          }`}
                        >
                          {isApproval ? "✓ Approved" : "↺ Rework requested"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                        <IconClockHour4 className="h-2.5 w-2.5" />
                        {timeAgo(note.created_at)}
                        {idx === 0 && (
                          <span className="ml-1 text-[9px] bg-muted rounded px-1 py-px font-medium uppercase tracking-wide">
                            Latest
                          </span>
                        )}
                      </p>
                    </div>

                    {isOwner && !isEditing && (
                      <button
                        type="button"
                        onClick={() => openEdit(note)}
                        className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="Edit feedback"
                      >
                        <IconEdit className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isOwner && isEditing && (
                      <button
                        type="button"
                        onClick={closeEdit}
                        className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="Cancel edit"
                      >
                        <IconX className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <div className="px-4 py-3 space-y-3 bg-background border-t border-border/40">
                    {editExistingFiles.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                          Saved attachments — × to remove
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {editExistingFiles.map((f, i) => {
                            const isImg = IMAGE_EXT.test(f.url);
                            return (
                              <div
                                key={i}
                                className="relative group/chip flex items-center bg-muted border rounded-lg overflow-hidden"
                              >
                                {isImg ? (
                                  <div className="w-12 h-12 shrink-0">
                                    <img
                                      src={f.url}
                                      alt={f.name ?? "img"}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 px-2.5 py-2">
                                    <IconPaperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <p className="text-xs truncate max-w-[90px]">
                                      {f.name ?? "file"}
                                    </p>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  disabled={editSaving}
                                  onClick={() =>
                                    setEditExistingFiles((prev) =>
                                      prev.filter((_, fi) => fi !== i),
                                    )
                                  }
                                  className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity"
                                >
                                  <IconX className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {editRows.map((row, rowIdx) => (
                      <FeedbackRowItem
                        key={row.id}
                        row={row}
                        index={rowIdx}
                        disabled={editSaving}
                        onMergeFiles={onEditMergeFiles}
                        onRemoveAttached={onEditRemoveAttached}
                        onTextChange={onEditTextChange}
                        onDragChange={onEditDragChange}
                        onRemove={() => removeEditRow(row.id)}
                        showRemove={editRows.length > 1}
                      />
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setEditRows((prev) => [...prev, makeRow()])
                      }
                      disabled={editSaving}
                      className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-muted-foreground/20 hover:border-purple-300 rounded-lg text-xs text-muted-foreground hover:text-purple-600 transition-colors disabled:opacity-40"
                    >
                      <IconPlus className="h-3.5 w-3.5" />
                      Add another point
                    </button>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs"
                        onClick={() =>
                          void handleSaveEdit(note.id, note.note_type)
                        }
                        disabled={editSaving}
                      >
                        {editSaving ? (
                          <>
                            <div className="h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <IconCheck className="h-3.5 w-3.5" />
                            Save changes
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={closeEdit}
                        disabled={editSaving}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {!isEditing &&
                  (note.note ||
                    imgFiles.length > 0 ||
                    otherFiles.length > 0) && (
                    <div className="px-4 py-3 space-y-3 bg-background border-t border-border/40">
                      {note.note && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
                          {note.note}
                        </p>
                      )}

                      {imgFiles.length > 0 && (
                        <ImageGalleryGrid
                          images={imgFiles}
                          onDownload={triggerDownload}
                        />
                      )}

                      {otherFiles.length > 0 && (
                        <div className="space-y-1.5">
                          {otherFiles.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2.5 px-3 py-2 bg-muted/40 hover:bg-muted/80 rounded-lg border border-border/40 cursor-pointer transition-colors group/file"
                              onClick={() =>
                                VIEWABLE_EXT.test(f.url)
                                  ? window.open(f.url, "_blank", "noopener")
                                  : triggerDownload(f.url, f.name ?? "file")
                              }
                            >
                              <div className="h-7 w-7 rounded-md bg-background border flex items-center justify-center shrink-0">
                                <IconPaperclip className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <span className="text-xs font-medium truncate flex-1">
                                {f.name ?? "file"}
                              </span>
                              {f.size && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {fmtSize(f.size)}
                                </span>
                              )}
                              <IconExternalLink className="h-3 w-3 text-muted-foreground/40 group-hover/file:text-muted-foreground shrink-0 transition-colors" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
