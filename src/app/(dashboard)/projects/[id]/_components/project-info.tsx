"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RichTextEditor from "@/components/rich-text-editor";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  IconCalendar,
  IconLink,
  IconHash,
  IconUser,
  IconCopy,
  IconCheck,
  IconPaperclip,
  IconDownload,
  IconPhoto,
  IconEdit,
  IconX,
  IconLoader2,
  IconAlignLeft,
  IconTrash,
  IconPlus,
} from "@tabler/icons-react";
import { uploadFile as uploadFileFn, deleteFile } from "@/lib/upload-file";

type ProjectFile = {
  url: string;
  public_id: string;
  name: string;
  original_name?: string;
  resource_type: string;
  size: number;
  storage?: "cloudinary" | "r2";
};

interface ProjectInfoProps {
  projectId: string;
  canEdit: boolean;
  project: {
    website_url: string | null;
    fiverr_order_id: string | null;
    client_name: string | null;
    created_at: Date;
    body?: string | null;
    files?: string | null;
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
      title="Copy"
    >
      {copied ? (
        <IconCheck className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <IconCopy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i;

function formatSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

async function handleDownload(file: ProjectFile) {
  try {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    const filename = file.original_name || file.name || "download";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    toast.success(`Downloading ${filename}`);
  } catch (error) {
    console.error("Download failed:", error);
    toast.error("Failed to download file");
    window.open(file.url, "_blank", "noopener,noreferrer");
  }
}

// ── Inline editable field ─────────────────────────────────────────────────────
function EditableField({
  label,
  value,
  icon,
  type = "text",
  onSave,
  placeholder,
  canEdit,
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  type?: string;
  onSave: (v: string | null) => Promise<void>;
  placeholder?: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(draft.trim() || null);
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  const isUrl = type === "url";

  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {editing ? (
          <div className="flex items-center gap-1.5 mt-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              type={type}
              placeholder={placeholder}
              className="h-7 text-sm py-0"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-green-600 hover:text-green-700 shrink-0"
              onClick={save}
              disabled={saving}
            >
              {saving ? (
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <IconCheck className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={cancel}
            >
              <IconX className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-0.5 group/field">
            {value ? (
              isUrl ? (
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {value}
                </a>
              ) : (
                <p className="text-sm font-mono bg-muted px-2 py-0.5 rounded break-all">
                  {value}
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Not provided
              </p>
            )}
            {value && <CopyButton value={value} />}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setDraft(value ?? "");
                  setEditing(true);
                }}
                className="opacity-0 group-hover/field:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                title={`Edit ${label}`}
              >
                <IconEdit className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjectInfo({ projectId, canEdit, project }: ProjectInfoProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(project.body ?? "");
  const [savingNotes, setSavingNotes] = useState(false);

  const [files, setFiles] = useState<ProjectFile[]>(() => {
    try {
      return project.files ? JSON.parse(project.files) : [];
    } catch {
      return [];
    }
  });
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function patch(payload: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      toast.success("Saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function saveNotes() {
    setSavingNotes(true);
    await patch({ body: notesDraft.trim() || null });
    setSavingNotes(false);
    setEditingNotes(false);
  }

  // ── Upload new files (uses uploadFile utility — supports R2 for ≥4 MB) ────
  async function handleAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    setUploading(true);
    try {
      const uploaded: ProjectFile[] = [];
      for (const file of Array.from(selected)) {
        // uploadFileFn auto-picks Cloudinary (<4 MB) or R2 presigned (≥4 MB)
        const data = await uploadFileFn(file);
        uploaded.push({
          url: data.url,
          public_id: data.public_id,
          name: file.name,
          original_name: data.original_name || file.name,
          resource_type: data.resource_type,
          size: data.size,
          storage: data.storage, // ← persisted so delete knows which backend
        });
      }
      const merged = [...files, ...uploaded];
      await patch({ files: JSON.stringify(merged) });
      setFiles(merged);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Remove a file: update DB first, then fire-and-forget storage delete ───
  async function handleRemoveFile(publicId: string) {
    setRemovingId(publicId);
    try {
      // Capture the file record before removing it from state
      const file = files.find((f) => f.public_id === publicId);

      const updated = files.filter((f) => f.public_id !== publicId);
      await patch({ files: JSON.stringify(updated) });
      setFiles(updated);

      // Fire-and-forget: delete from Cloudinary or R2
      // Non-blocking — a storage failure should never surface to the user
      if (file) {
        deleteFile({
          public_id: file.public_id,
          resource_type: file.resource_type,
          storage: file.storage,
          url: file.url,
        }).catch((err) =>
          console.warn("Storage delete failed for:", file.public_id, err),
        );
      }
    } catch {
      toast.error("Failed to remove file");
    } finally {
      setRemovingId(null);
    }
  }

  const imageFiles = files.filter((f) => IMAGE_EXT.test(f.url));
  const otherFiles = files.filter((f) => !IMAGE_EXT.test(f.url));

  return (
    <div className="space-y-6">
      {/* ── Row 1: Project Info + Notes ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Project Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Project Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <EditableField
              label="Client Name"
              value={project.client_name}
              icon={<IconUser className="h-4 w-4 text-muted-foreground" />}
              onSave={(v) => patch({ client_name: v })}
              placeholder="e.g. John Smith"
              canEdit={canEdit}
            />
            <EditableField
              label="Website"
              value={project.website_url}
              icon={<IconLink className="h-4 w-4 text-muted-foreground" />}
              type="url"
              onSave={(v) => patch({ website_url: v })}
              placeholder="https://example.com"
              canEdit={canEdit}
            />
            <EditableField
              label="Fiverr Order ID"
              value={project.fiverr_order_id}
              icon={<IconHash className="h-4 w-4 text-muted-foreground" />}
              onSave={(v) => patch({ fiverr_order_id: v })}
              placeholder="FO-XXXXXX"
              canEdit={canEdit}
            />
            <div className="flex items-start gap-3">
              <IconCalendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Created At</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(project.created_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <IconAlignLeft className="h-4 w-4 text-muted-foreground" />
              Notes
              <span className="text-xs font-normal text-muted-foreground">
                optional
              </span>
            </CardTitle>
          </CardHeader>

          <CardContent>
            {editingNotes ? (
              <div className="space-y-3">
                <RichTextEditor content={notesDraft} onChange={setNotesDraft} />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={saveNotes}
                    disabled={savingNotes}
                  >
                    {savingNotes ? (
                      <IconLoader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <IconCheck className="h-3.5 w-3.5 mr-1" />
                    )}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setNotesDraft(project.body ?? "");
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="min-h-[80px]">
                {project.body ? (
                  <div
                    className={`relative max-w-none text-muted-foreground whitespace-pre-wrap
  [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4
  [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3
  [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2
  [&_p]:mb-2
  [&_p:empty]:h-4
  [&_ul]:list-disc [&_ul]:ml-5
  [&_li]:mb-1 ${canEdit ? "cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 py-1" : ""}`}
                    onClick={() => {
                      if (canEdit) {
                        setNotesDraft(project.body ?? "");
                        setEditingNotes(true);
                      }
                    }}
                  >
                    <div dangerouslySetInnerHTML={{ __html: project.body }} />
                    {canEdit && (
                      <IconEdit className="absolute top-1 right-1 h-3.5 w-3.5 text-muted-foreground opacity-40" />
                    )}
                  </div>
                ) : canEdit ? (
                  <button
                    type="button"
                    onClick={() => setEditingNotes(true)}
                    className="w-full text-left px-3 py-4 rounded-lg border border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/30 transition-colors"
                  >
                    + Add notes or details…
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No notes added.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 2: Attachments ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <IconPaperclip className="h-4 w-4 text-muted-foreground" />
              Attachments
              <span className="text-sm font-normal text-muted-foreground">
                ({files.length})
              </span>
            </CardTitle>
            {canEdit && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleAddFiles}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <IconPlus className="h-3.5 w-3.5" />
                      Add Files
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            canEdit ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center text-sm text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/20 transition-colors"
              >
                <IconPaperclip className="h-6 w-6 mx-auto mb-2 opacity-40" />
                Click to upload files
              </button>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                No attachments.
              </p>
            )
          ) : (
            <div className="space-y-4">
              {/* Image grid */}
              {imageFiles.length > 0 && (
                <div
                  className={`grid gap-2 ${
                    imageFiles.length === 1
                      ? "grid-cols-1 max-w-sm"
                      : imageFiles.length === 2
                        ? "grid-cols-2"
                        : "grid-cols-3"
                  }`}
                >
                  {imageFiles.map((f, i) => (
                    <div
                      key={f.public_id || i}
                      className="group relative aspect-video rounded-lg overflow-hidden border bg-muted"
                    >
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full h-full"
                      >
                        <img
                          src={f.url}
                          alt={f.original_name || f.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <IconPhoto className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-xs truncate">
                            {f.original_name || f.name}
                          </p>
                        </div>
                      </a>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(f.public_id)}
                          disabled={removingId === f.public_id}
                          className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:opacity-60"
                          title="Remove"
                        >
                          {removingId === f.public_id ? (
                            <IconLoader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <IconX className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Other files list */}
              {otherFiles.length > 0 && (
                <div className="space-y-2">
                  {otherFiles.map((f, i) => (
                    <div
                      key={f.public_id || i}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/40 hover:bg-muted/80 transition-colors group"
                    >
                      <div className="h-9 w-9 rounded-lg border bg-background flex items-center justify-center shrink-0">
                        <IconPaperclip className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {f.original_name || f.name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {f.resource_type}
                          {f.size ? ` • ${formatSize(f.size)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDownload(f)}
                          title={`Download ${f.original_name || f.name}`}
                        >
                          <IconDownload className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(f.public_id)}
                            disabled={removingId === f.public_id}
                            className="p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                            title="Remove"
                          >
                            {removingId === f.public_id ? (
                              <IconLoader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <IconTrash className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
