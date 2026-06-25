"use client";
// src/app/(dashboard)/portfolio/_components/portfolio-dialog.tsx

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  IconUpload,
  IconX,
  IconPhoto,
  IconFileTypePdf,
  IconLoader2,
} from "@tabler/icons-react";
import { uploadFile, deleteFile, UploadResult } from "@/lib/upload-file";
import {
  SOURCE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  STATUS_OPTIONS,
  WEBSITE_BUILDER_OPTIONS,
  PortfolioItem,
} from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ✅ NEW: Correctly extract public_id and storage from a URL
function urlToStored(url: string, type: "image" | "raw"): StoredFile {
  let storage: "cloudinary" | "r2" = "r2";
  let publicId = url;

  if (url.includes("cloudinary.com")) {
    storage = "cloudinary";
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/");
      // pathname: /<cloud>/<resource_type>/upload/<version>/<public_id>.<ext>
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
    original_name:
      url.split("/").pop() ?? (type === "image" ? "image" : "document.pdf"),
    size: 0,
  };
}

// ── Section heading ───────────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        <div className="flex-1 h-px bg-border" />
      </div>
      {children}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-foreground mb-1.5 block">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ── File pill ─────────────────────────────────────────────────────────────────
function FilePill({
  icon: Icon,
  name,
  onRemove,
}: {
  icon: React.ElementType;
  name: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm truncate min-w-0">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────
function UploadZone({
  label,
  accept,
  multiple = false,
  onFiles,
  progress,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  onFiles: (f: FileList) => void;
  progress: number | null;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/10 py-3.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {progress !== null ? (
          <>
            <IconLoader2 className="h-4 w-4 animate-spin" /> Uploading{" "}
            {progress}%
          </>
        ) : (
          <>
            <IconUpload className="h-4 w-4" /> {label}
          </>
        )}
      </button>
      {progress !== null && <Progress value={progress} className="h-1" />}
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────
const EMPTY = {
  project_date: "",
  project_id: "",
  linked_project_id: "",
  project_name: "",
  customer_name: "",
  business_name: "",
  email: "",
  phone: "",
  source: "DIRECT_CLIENT",
  project_type: "",
  website_builder: "",
  status: "DRAFT",
  website_url: "",
  figma_url: "",
  short_description: "",
  is_public: false,
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface PortfolioDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  item?: PortfolioItem | null;
  pmsProjects?: { id: string; name: string }[];
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PortfolioDialog({
  open,
  onClose,
  onSaved,
  item,
  pmsProjects = [],
}: PortfolioDialogProps) {
  const isEdit = !!item;
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [featuredImage, setFeaturedImage] = useState<StoredFile | null>(null);
  const [galleryImages, setGalleryImages] = useState<StoredFile[]>([]);
  const [pdfDocuments, setPdfDocuments] = useState<StoredFile[]>([]);
  const [featuredProg, setFeaturedProg] = useState<number | null>(null);
  const [galleryProg, setGalleryProg] = useState<number | null>(null);
  const [pdfProg, setPdfProg] = useState<number | null>(null);

  useEffect(() => {
    if (item) {
      setForm({
        project_date: item.project_date ?? "",
        project_id: item.project_id ?? "",
        linked_project_id: item.linked_project_id ?? "",
        project_name: item.project_name,
        customer_name: item.customer_name ?? "",
        business_name: item.business_name ?? "",
        email: item.email ?? "",
        phone: item.phone ?? "",
        source: item.source,
        project_type: item.project_type ?? "",
        website_builder: item.website_builder ?? "",
        status: item.status,
        website_url: item.website_url ?? "",
        figma_url: item.figma_url ?? "",
        short_description: item.short_description ?? "",
        is_public: item.is_public,
      });

      // ✅ Use urlToStored to correctly parse the URL into a StoredFile object
      setFeaturedImage(
        item.featured_image ? urlToStored(item.featured_image, "image") : null,
      );
      const gallery = safeArray(item.gallery_images);
      const pdfs = safeArray(item.pdf_documents);
      setGalleryImages(gallery.map((url) => urlToStored(url, "image")));
      setPdfDocuments(pdfs.map((url) => urlToStored(url, "raw")));
    } else {
      setForm(EMPTY);
      setFeaturedImage(null);
      setGalleryImages([]);
      setPdfDocuments([]);
    }
  }, [item, open]);

  const set = (k: keyof typeof EMPTY) => (v: string | boolean) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ── Upload handlers ───────────────────────────────────────────────────────
  const uploadFeatured = async (files: FileList) => {
    const file = files[0];
    setFeaturedProg(0);
    try {
      const r = await uploadFile(file, setFeaturedProg);
      setFeaturedImage(toStoredFile(r));
      toast.success("Featured image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setFeaturedProg(null);
    }
  };

  const uploadGallery = async (files: FileList) => {
    const results: StoredFile[] = [];
    for (const file of Array.from(files)) {
      setGalleryProg(0);
      try {
        const r = await uploadFile(file, setGalleryProg);
        results.push(toStoredFile(r));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed: ${file.name}`);
      }
    }
    setGalleryProg(null);
    if (results.length) {
      setGalleryImages((p) => [...p, ...results]);
      toast.success(`${results.length} image(s) uploaded`);
    }
  };

  const uploadPdfs = async (files: FileList) => {
    const results: StoredFile[] = [];
    for (const file of Array.from(files)) {
      setPdfProg(0);
      try {
        const r = await uploadFile(file, setPdfProg);
        results.push(toStoredFile(r));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed: ${file.name}`);
      }
    }
    setPdfProg(null);
    if (results.length) {
      setPdfDocuments((p) => [...p, ...results]);
      toast.success(`${results.length} document(s) uploaded`);
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
  };

  const removeGallery = async (i: number) => {
    try {
      await deleteFile(galleryImages[i]);
    } catch {
      /* non-blocking */
    }
    setGalleryImages((p) => p.filter((_, idx) => idx !== i));
  };

  const removePdf = async (i: number) => {
    try {
      await deleteFile(pdfDocuments[i]);
    } catch {
      /* non-blocking */
    }
    setPdfDocuments((p) => p.filter((_, idx) => idx !== i));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.project_name.trim()) {
      toast.error("Project Name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        project_date: form.project_date || null,
        project_id: form.project_id || null,
        linked_project_id: form.linked_project_id || null,
        customer_name: form.customer_name || null,
        business_name: form.business_name || null,
        email: form.email || null,
        phone: form.phone || null,
        project_type: form.project_type || null,
        website_builder: form.website_builder || null,
        website_url: form.website_url || null,
        figma_url: form.figma_url || null,
        short_description: form.short_description || null,
        featured_image: featuredImage?.url ?? null,
        gallery_images: galleryImages.map((f) => f.url),
        pdf_documents: pdfDocuments.map((f) => f.url),
      };
      const res = await fetch(
        isEdit ? `/api/portfolio/${item!.id}` : "/api/portfolio",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Save failed");
      }
      toast.success(isEdit ? "Portfolio updated" : "Portfolio entry created");
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* ✅ Added flex flex-col to make height constraints work */}
      <DialogContent
        className="p-0 gap-0 overflow-hidden flex flex-col"
        style={{
          width: "min(100vw, 680px)",
          maxWidth: "100vw",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/10 shrink-0">
          <DialogTitle className="text-lg font-bold">
            {isEdit ? "Edit Portfolio Entry" : "New Portfolio Entry"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEdit
              ? "Update the details for this portfolio project."
              : "Add a completed project to your portfolio."}
          </p>
        </DialogHeader>

        {/* ✅ Added min-h-0 to allow flex child to shrink and scroll */}
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5 space-y-6">
          {/* ── General ────────────────────────────────────────────────────── */}
          <Section title="General Information">
            <Field label="Project Name" required>
              <Input
                placeholder="e.g. Sweet on Vermont WooCommerce Store"
                value={form.project_name}
                onChange={(e) => set("project_name")(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project Date">
                <Input
                  type="date"
                  value={form.project_date}
                  onChange={(e) => set("project_date")(e.target.value)}
                />
              </Field>
              <Field label="Project ID">
                <Input
                  placeholder="PRJ-001"
                  value={form.project_id}
                  onChange={(e) => set("project_id")(e.target.value)}
                />
              </Field>
            </div>
            {pmsProjects.length > 0 && (
              <Field label="Linked PMS Project">
                <Select
                  value={form.linked_project_id || "none"}
                  onValueChange={(v) =>
                    set("linked_project_id")(v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {pmsProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </Section>

          {/* ── Classification ─────────────────────────────────────────────── */}
          <Section title="Classification">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source" required>
                <Select value={form.source} onValueChange={set("source")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={set("status")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Project Type">
                <Select
                  value={form.project_type || "none"}
                  onValueChange={(v) =>
                    set("project_type")(v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {PROJECT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Website Builder">
                <Select
                  value={form.website_builder || "none"}
                  onValueChange={(v) =>
                    set("website_builder")(v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {WEBSITE_BUILDER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          {/* ── Client ─────────────────────────────────────────────────────── */}
          <Section title="Client Information">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer Name">
                <Input
                  placeholder="John Smith"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name")(e.target.value)}
                />
              </Field>
              <Field label="Business Name">
                <Input
                  placeholder="Smith Bakery Ltd"
                  value={form.business_name}
                  onChange={(e) => set("business_name")(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={form.email}
                  onChange={(e) => set("email")(e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input
                  placeholder="+1 555 000 0000"
                  value={form.phone}
                  onChange={(e) => set("phone")(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          {/* ── Links ──────────────────────────────────────────────────────── */}
          <Section title="Links">
            <Field label="Website URL">
              <Input
                placeholder="https://example.com"
                value={form.website_url}
                onChange={(e) => set("website_url")(e.target.value)}
              />
            </Field>
            <Field label="Figma URL">
              <Input
                placeholder="https://figma.com/file/..."
                value={form.figma_url}
                onChange={(e) => set("figma_url")(e.target.value)}
              />
            </Field>
          </Section>

          {/* ── Content ────────────────────────────────────────────────────── */}
          <Section title="Content">
            <Field label="Short Description">
              <Textarea
                rows={3}
                placeholder="Brief summary — what was built, for whom, and the key outcome..."
                value={form.short_description}
                onChange={(e) => set("short_description")(e.target.value)}
              />
            </Field>
          </Section>

          {/* ── Media ──────────────────────────────────────────────────────── */}
          <Section title="Media & Files">
            {/* Featured Image */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Featured Image</Label>
              {featuredImage ? (
                <FilePill
                  icon={IconPhoto}
                  name={featuredImage.original_name}
                  onRemove={removeFeatured}
                />
              ) : (
                <UploadZone
                  label="Upload featured image"
                  accept="image/*"
                  onFiles={uploadFeatured}
                  progress={featuredProg}
                />
              )}
            </div>

            {/* Gallery */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Gallery Images
                {galleryImages.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({galleryImages.length})
                  </span>
                )}
              </Label>
              {galleryImages.length > 0 && (
                <div className="space-y-1">
                  {galleryImages.map((f, i) => (
                    <FilePill
                      key={f.url + i}
                      icon={IconPhoto}
                      name={f.original_name}
                      onRemove={() => removeGallery(i)}
                    />
                  ))}
                </div>
              )}
              <UploadZone
                label="Add gallery images"
                accept="image/*"
                multiple
                onFiles={uploadGallery}
                progress={galleryProg}
              />
            </div>

            {/* PDFs */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                PDF Documents
                {pdfDocuments.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground font-normal">
                    ({pdfDocuments.length})
                  </span>
                )}
              </Label>
              {pdfDocuments.length > 0 && (
                <div className="space-y-1">
                  {pdfDocuments.map((f, i) => (
                    <FilePill
                      key={f.url + i}
                      icon={IconFileTypePdf}
                      name={f.original_name}
                      onRemove={() => removePdf(i)}
                    />
                  ))}
                </div>
              )}
              <UploadZone
                label="Add PDF documents"
                accept="application/pdf"
                multiple
                onFiles={uploadPdfs}
                progress={pdfProg}
              />
            </div>
          </Section>

          {/* ── Settings ───────────────────────────────────────────────────── */}
          <Section title="Settings">
            <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3.5">
              <div>
                <p className="text-sm font-medium">Public Portfolio</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Show on public portfolio website
                </p>
              </div>
              <Switch
                checked={form.is_public}
                onCheckedChange={(v) => set("is_public")(v)}
              />
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t px-6 py-4 bg-muted/10">
          <p className="text-xs text-muted-foreground">
            {isEdit
              ? "Changes are saved immediately."
              : "All fields except Project Name are optional."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="min-w-[80px]"
            >
              {saving ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : isEdit ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
