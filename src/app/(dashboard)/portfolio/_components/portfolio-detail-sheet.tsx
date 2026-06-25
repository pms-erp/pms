"use client";
// src/app/(dashboard)/portfolio/_components/portfolio-detail-sheet.tsx

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
} from "@/components/ui/alert-dialog";
import {
  IconEdit,
  IconCheck,
  IconX,
  IconExternalLink,
  IconBrandFigma,
  IconGlobe,
  IconPhoto,
  IconFileTypePdf,
  IconUpload,
  IconTrash,
  IconLoader2,
} from "@tabler/icons-react";
import { uploadFile, deleteFile, UploadResult } from "@/lib/upload-file";
import {
  SOURCE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  STATUS_OPTIONS,
  WEBSITE_BUILDER_OPTIONS,
  PortfolioItem,
  OptionItem,
} from "../types";
import { cn } from "@/lib/utils";

function safeArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }
  return [];
}

function labelOf(options: readonly OptionItem[], value?: string | null) {
  return options.find((o) => o.value === value)?.label ?? value ?? "—";
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_CFG: Record<string, { cls: string; dot: string }> = {
  DRAFT: {
    cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  PUBLISHED: {
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  ARCHIVED: {
    cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

interface StoredFile {
  url: string;
  public_id: string;
  resource_type: string;
  storage: "cloudinary" | "r2";
  original_name: string;
  size: number;
}

function toStoredFile(r: UploadResult): StoredFile {
  return {
    url: r.url,
    public_id: r.public_id,
    resource_type: r.resource_type,
    storage: r.storage,
    original_name: r.original_name,
    size: r.size,
  };
}

// ✅ REPLACED: Correctly extract public_id and storage from a URL
function urlToStored(url: string, type: "image" | "raw"): StoredFile {
  let storage: "cloudinary" | "r2" = "r2";
  let publicId = url;

  if (url.includes("cloudinary.com")) {
    storage = "cloudinary";
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/");
      let startIdx = 4;
      if (parts[4] && /^v\d+$/.test(parts[4])) startIdx = 5;
      const withExt = parts.slice(startIdx).join("/");
      const lastDot = withExt.lastIndexOf(".");
      publicId = lastDot > 0 ? withExt.substring(0, lastDot) : withExt;
    } catch {
      publicId = url;
    }
  } else {
    storage = "r2";
    try {
      const u = new URL(url);
      publicId = u.pathname.startsWith("/") ? u.pathname.slice(1) : u.pathname;
    } catch {
      publicId = url;
    }
  }

  return {
    url,
    public_id: publicId,
    resource_type: type,
    storage,
    original_name: url.split("/").pop() ?? url,
    size: 0,
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
        {children}
      </p>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function EditableField({
  label,
  value,
  onSave,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onSave: (v: string) => Promise<void>;
  type?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };
  if (editing) {
    return (
      <div className="space-y-1.5">
        <Label className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </Label>
        {multiline ? (
          <Textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm resize-none"
            autoFocus
          />
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm h-8"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        )}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={save}
            disabled={saving}
          >
            {saving ? (
              <IconLoader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <IconCheck className="h-3 w-3 mr-1" />
                Save
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="group w-full text-left rounded-xl border bg-card px-3.5 py-3 hover:bg-muted/40 transition-colors"
    >
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-sm font-medium leading-tight",
            !value && "text-muted-foreground italic",
          )}
        >
          {value || "Click to edit"}
        </p>
        <IconEdit className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

function EditableSelect({
  label,
  value,
  options,
  onSave,
}: {
  label: string;
  value: string | null;
  options: readonly OptionItem[];
  onSave: (v: string | null) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const handleChange = async (v: string) => {
    setSaving(true);
    try {
      await onSave(v === "none" ? null : v);
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded-xl border bg-card px-3.5 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </p>
      <Select
        value={value ?? "none"}
        onValueChange={handleChange}
        disabled={saving}
      >
        <SelectTrigger className="h-7 text-sm border-0 p-0 shadow-none focus:ring-0 bg-transparent font-medium">
          <SelectValue>
            {saving ? "Saving…" : labelOf(options, value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— None —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ImageCard({
  file,
  onRemove,
}: {
  file: StoredFile;
  onRemove: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <div className="group relative overflow-hidden rounded-lg border aspect-video bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.url}
          alt={file.original_name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2">
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-white/20 backdrop-blur-sm p-1.5"
          >
            <IconExternalLink className="h-4 w-4 text-white" />
          </a>
          <button
            onClick={() => setConfirmOpen(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-red-500/80 backdrop-blur-sm p-1.5"
          >
            <IconTrash className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Image</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the image from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRemove}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PdfCard({
  file,
  onRemove,
}: {
  file: StoredFile;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 group">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 border border-red-100 dark:bg-red-950/30 dark:border-red-900">
        <IconFileTypePdf className="h-4 w-4 text-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.original_name}</p>
        {file.size > 0 && (
          <p className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-1.5 hover:bg-muted transition-colors"
        >
          <IconExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
        </a>
        <button
          onClick={onRemove}
          className="rounded-md p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <IconTrash className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface PortfolioDetailSheetProps {
  open: boolean;
  onClose: () => void;
  item: PortfolioItem | null;
  onSaved: () => void;
}

export function PortfolioDetailSheet({
  open,
  onClose,
  item,
  onSaved,
}: PortfolioDetailSheetProps) {
  const featuredInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [featuredImage, setFeaturedImage] = useState<StoredFile | null>(null);
  const [galleryImages, setGalleryImages] = useState<StoredFile[]>([]);
  const [pdfDocuments, setPdfDocuments] = useState<StoredFile[]>([]);
  const [featuredProgress, setFeaturedProgress] = useState<number | null>(null);
  const [galleryProgress, setGalleryProgress] = useState<number | null>(null);
  const [pdfProgress, setPdfProgress] = useState<number | null>(null);
  const [savingPublic, setSavingPublic] = useState(false);

  useEffect(() => {
    if (!item) {
      setFeaturedImage(null);
      setGalleryImages([]);
      setPdfDocuments([]);
      return;
    }
    setFeaturedImage(
      item.featured_image ? urlToStored(item.featured_image, "image") : null,
    );
    setGalleryImages(
      safeArray(item.gallery_images).map((u) => urlToStored(u, "image")),
    );
    setPdfDocuments(
      safeArray(item.pdf_documents).map((u) => urlToStored(u, "raw")),
    );
  }, [item]);

  if (!item) return null;

  const statusCfg = STATUS_CFG[item.status] ?? STATUS_CFG.DRAFT;

  const patch = async (data: Record<string, unknown>) => {
    const res = await fetch(`/api/portfolio/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Save failed");
    onSaved();
  };

  const patchField = (key: string) => async (value: string | null) => {
    await patch({ [key]: value || null });
    toast.success("Saved");
  };

  const uploadFeatured = async (file: File) => {
    setFeaturedProgress(0);
    try {
      const r = await uploadFile(file, setFeaturedProgress);
      const sf = toStoredFile(r);
      setFeaturedImage(sf);
      await patch({ featured_image: sf.url });
      toast.success("Featured image updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setFeaturedProgress(null);
    }
  };

  const removeFeatured = async () => {
    if (!featuredImage) return;
    try {
      await deleteFile(featuredImage);
    } catch {
      /* non-blocking */
    }
    setFeaturedImage(null);
    await patch({ featured_image: null });
    toast.success("Featured image removed");
  };

  const addGallery = async (files: FileList) => {
    const results: StoredFile[] = [];
    for (const file of Array.from(files)) {
      setGalleryProgress(0);
      try {
        const r = await uploadFile(file, setGalleryProgress);
        results.push(toStoredFile(r));
        toast.success(`${file.name} uploaded`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
    setGalleryProgress(null);
    if (!results.length) return;
    const next = [...galleryImages, ...results];
    setGalleryImages(next);
    await patch({ gallery_images: next.map((f) => f.url) });
  };

  const removeGallery = async (index: number) => {
    const file = galleryImages[index];
    try {
      await deleteFile(file);
    } catch {
      /* non-blocking */
    }
    const next = galleryImages.filter((_, i) => i !== index);
    setGalleryImages(next);
    await patch({ gallery_images: next.map((f) => f.url) });
    toast.success("Image removed");
  };

  const uploadPdfs = async (files: FileList) => {
    const results: StoredFile[] = [];
    for (const file of Array.from(files)) {
      setPdfProgress(0);
      try {
        const r = await uploadFile(file, setPdfProgress);
        results.push(toStoredFile(r));
        toast.success(`${file.name} uploaded`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    }
    setPdfProgress(null);
    if (!results.length) return;
    const next = [...pdfDocuments, ...results];
    setPdfDocuments(next);
    await patch({ pdf_documents: next.map((f) => f.url) });
  };

  const removePdf = async (index: number) => {
    const file = pdfDocuments[index];
    try {
      await deleteFile(file);
    } catch {
      /* non-blocking */
    }
    const next = pdfDocuments.filter((_, i) => i !== index);
    setPdfDocuments(next);
    await patch({ pdf_documents: next.map((f) => f.url) });
    toast.success("Document removed");
  };

  const togglePublic = async (val: boolean) => {
    setSavingPublic(true);
    try {
      await patch({ is_public: val });
      toast.success(val ? "Set to public" : "Set to private");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSavingPublic(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex flex-col gap-0 p-0 overflow-hidden border-l"
        style={{ width: "min(100vw, 680px)", maxWidth: "100vw" }}
      >
        <SheetHeader className="shrink-0 px-6 pt-5 pb-4 border-b bg-muted/10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    statusCfg.cls,
                  )}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot)}
                  />
                  {item.status}
                </span>
                {item.is_public && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">
                    <IconGlobe className="h-3 w-3" /> Public
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold leading-tight truncate">
                {item.project_name}
              </h2>
              {item.business_name && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {item.business_name}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-muted transition-colors shrink-0 mt-0.5"
            >
              {/* <IconX className="h-4 w-4" /> */}
            </button>
          </div>
        </SheetHeader>

        {/* ✅ Added min-h-0 to allow flex child to shrink and scroll */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-7">
          <div>
            <SectionTitle>Featured Image</SectionTitle>
            {featuredImage ? (
              <div className="relative rounded-xl overflow-hidden border shadow-sm group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={featuredImage.url}
                  alt="Featured"
                  className="w-full h-56 object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-3">
                  <button
                    onClick={() => featuredInputRef.current?.click()}
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <IconUpload className="h-3.5 w-3.5" /> Replace
                  </button>
                  <button
                    onClick={removeFeatured}
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full bg-red-500/80 backdrop-blur-sm px-3 py-1.5 text-white text-xs font-medium flex items-center gap-1.5"
                  >
                    <IconTrash className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => featuredInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <IconPhoto className="h-5 w-5" />
                </div>
                <span className="font-medium">Upload featured image</span>
                <span className="text-xs opacity-70">JPG, PNG, WebP</span>
              </button>
            )}
            {featuredProgress !== null && (
              <Progress value={featuredProgress} className="h-1 mt-2" />
            )}
            <input
              ref={featuredInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFeatured(f);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <SectionTitle>Description</SectionTitle>
            <EditableField
              label="Short Description"
              value={item.short_description ?? ""}
              multiline
              onSave={patchField("short_description")}
            />
          </div>

          <div>
            <SectionTitle>Project Details</SectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <EditableField
                label="Project Date"
                value={item.project_date ?? ""}
                type="date"
                onSave={patchField("project_date")}
              />
              <EditableField
                label="Project ID"
                value={item.project_id ?? ""}
                onSave={patchField("project_id")}
              />
              <EditableSelect
                label="Source"
                value={item.source}
                options={SOURCE_OPTIONS}
                onSave={patchField("source")}
              />
              <EditableSelect
                label="Project Type"
                value={item.project_type}
                options={PROJECT_TYPE_OPTIONS}
                onSave={patchField("project_type")}
              />
              <div className="col-span-2">
                <EditableSelect
                  label="Website Builder"
                  value={item.website_builder}
                  options={WEBSITE_BUILDER_OPTIONS}
                  onSave={patchField("website_builder")}
                />
              </div>
              <div className="col-span-2">
                <EditableSelect
                  label="Status"
                  value={item.status}
                  options={STATUS_OPTIONS}
                  onSave={patchField("status")}
                />
              </div>
            </div>
          </div>

          <div>
            <SectionTitle>Client Information</SectionTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <EditableField
                label="Customer Name"
                value={item.customer_name ?? ""}
                onSave={patchField("customer_name")}
              />
              <EditableField
                label="Business Name"
                value={item.business_name ?? ""}
                onSave={patchField("business_name")}
              />
              <div className="col-span-2">
                <EditableField
                  label="Email"
                  value={item.email ?? ""}
                  type="email"
                  onSave={patchField("email")}
                />
              </div>
              <div className="col-span-2">
                <EditableField
                  label="Phone"
                  value={item.phone ?? ""}
                  onSave={patchField("phone")}
                />
              </div>
            </div>
          </div>

          <div>
            <SectionTitle>Links</SectionTitle>
            <div className="space-y-2.5">
              <EditableField
                label="Website URL"
                value={item.website_url ?? ""}
                onSave={patchField("website_url")}
              />
              <EditableField
                label="Figma URL"
                value={item.figma_url ?? ""}
                onSave={patchField("figma_url")}
              />
            </div>
            {(item.website_url || item.figma_url) && (
              <div className="flex gap-3 mt-2">
                {item.website_url && (
                  <a
                    href={item.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <IconGlobe className="h-3.5 w-3.5" /> Open Website
                  </a>
                )}
                {item.figma_url && (
                  <a
                    href={item.figma_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <IconBrandFigma className="h-3.5 w-3.5" /> Open Figma
                  </a>
                )}
              </div>
            )}
          </div>

          <div>
            <SectionTitle>Gallery · {galleryImages.length} images</SectionTitle>
            {galleryImages.length > 0 && (
              <div
                className={cn(
                  "grid gap-2 mb-2",
                  galleryImages.length === 1
                    ? "grid-cols-1"
                    : galleryImages.length === 2
                      ? "grid-cols-2"
                      : "grid-cols-3",
                )}
              >
                {galleryImages.map((f, i) => (
                  <ImageCard
                    key={f.url + i}
                    file={f}
                    onRemove={() => removeGallery(i)}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.multiple = true;
                input.onchange = (e) => {
                  const files = (e.target as HTMLInputElement).files;
                  if (files?.length) addGallery(files);
                };
                input.click();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <IconUpload className="h-4 w-4" />
              {galleryProgress !== null
                ? `Uploading… ${galleryProgress}%`
                : "Add gallery images"}
            </button>
            {galleryProgress !== null && (
              <Progress value={galleryProgress} className="h-1 mt-1" />
            )}
          </div>

          <div>
            <SectionTitle>Documents · {pdfDocuments.length} files</SectionTitle>
            {pdfDocuments.length > 0 && (
              <div className="space-y-2 mb-2">
                {pdfDocuments.map((f, i) => (
                  <PdfCard
                    key={f.url + i}
                    file={f}
                    onRemove={() => removePdf(i)}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <IconUpload className="h-4 w-4" />
              {pdfProgress !== null
                ? `Uploading… ${pdfProgress}%`
                : "Add PDF documents"}
            </button>
            {pdfProgress !== null && (
              <Progress value={pdfProgress} className="h-1 mt-1" />
            )}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) uploadPdfs(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div>
            <SectionTitle>Settings</SectionTitle>
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
              <div>
                <p className="text-sm font-medium">Public Portfolio</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Visible on public portfolio website
                </p>
              </div>
              <Switch
                checked={item.is_public}
                onCheckedChange={togglePublic}
                disabled={savingPublic}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Created {fmt(item.created_at)}</span>
              <span>Updated {fmt(item.updated_at)}</span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
