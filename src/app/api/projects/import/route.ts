// app/api/projects/import/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projects, tasks, taskNotes, users } from "@/db/schema";
import { nanoid } from "nanoid";
import { uploadToStorage } from "@/lib/server-storage";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmbeddedFile {
  url: string;
  public_id: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
  storage?: "cloudinary" | "r2";
  _data?: string; // base64 bytes (v2 export)
  _mime?: string;
  _embedded?: boolean;
}

interface ExportedNote {
  id: string;
  task_id: string;
  note: string;
  note_type: "COMMENT" | "APPROVAL" | "REJECTION" | "FEEDBACK_IMAGE";
  metadata: string | null;
  _embeddedMetadata?: EmbeddedFile[] | null;
  created_at: string | Date;
  user_id: string;
}

interface ExportedTask {
  id: string;
  title: string;
  description?: string | null;
  team_type: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK";
  files?: EmbeddedFile[] | string | null;
  estimated_minutes?: number | null;
  due_date?: string | null;
  rework_count?: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  assigned_to_id: string;
  assigned_by_id: string;
  qa_assigned_to_id?: string | null;
}

interface ExportedProject {
  name: string;
  client_name?: string | null;
  website_url?: string | null;
  fiverr_order_id?: string | null;
  body?: string | null;
  status?: string;
  files?: EmbeddedFile[] | string | null;
}

interface ImportPayload {
  __version?: string;
  project: ExportedProject;
  tasks?: ExportedTask[];
  notes?: ExportedNote[];
}

// ─── Resolve user ID ──────────────────────────────────────────────────────────
// Checks if the exported user ID exists in this system.
// If yes → use original assignee (same user, same system).
// If no  → fall back to the importer's ID.
async function resolveUserId(
  exportedId: string | null | undefined,
  fallbackId: string,
): Promise<string> {
  if (!exportedId) return fallbackId;
  try {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, exportedId))
      .limit(1);
    return result[0]?.id ?? fallbackId;
  } catch {
    return fallbackId;
  }
}

// Same as above but returns null instead of a fallback (for QA assignee)
async function resolveUserIdNullable(
  exportedId: string | null | undefined,
): Promise<string | null> {
  if (!exportedId) return null;
  try {
    const result = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, exportedId))
      .limit(1);
    return result[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Re-upload one embedded file to storage (Cloudinary or R2) ───────────────
async function reuploadFile(f: EmbeddedFile): Promise<EmbeddedFile> {
  // v1 export or not embedded → strip binary fields and return
  if (!f._embedded || !f._data) {
    const { _data: _, _mime: __, _embedded: ___, ...clean } = f;
    return clean;
  }

  try {
    const mime = f._mime ?? "application/octet-stream";

    // Guard: skip re-upload if base64 data is too large (>8 MB decoded)
    const estimatedBytes = Math.ceil((f._data.length * 3) / 4);
    if (estimatedBytes > 8 * 1024 * 1024) {
      console.warn(
        `Skipping re-upload for ${f.name ?? "file"}: too large (${Math.round(
          estimatedBytes / 1024 / 1024,
        )} MB). Using original URL.`,
      );
      return {
        url: f.url,
        public_id: f.public_id,
        name: f.name,
        original_name: f.original_name,
        resource_type: f.resource_type,
        size: f.size,
        storage: f.storage,
      };
    }

    const buffer = Buffer.from(f._data, "base64");
    const fileName = f.name ?? f.original_name ?? "file";

    const result = await uploadToStorage({
      fileName,
      fileType: mime,
      fileSize: buffer.length,
      fileBuffer: buffer,
      folder: "imports",
    });

    return {
      url: result.url,
      public_id: result.public_id,
      name: f.name,
      original_name: f.original_name ?? f.name,
      resource_type: result.resource_type,
      size: result.size,
      storage: result.storage,
    };
  } catch (err) {
    console.error(`Re-upload failed for ${f.name ?? "file"}:`, err);
    // Fall back to original URL — strip binary data so DB doesn't store it
    return {
      url: f.url,
      public_id: f.public_id,
      name: f.name,
      original_name: f.original_name,
      resource_type: f.resource_type,
      size: f.size,
      storage: f.storage,
    };
  }
}

// ─── Re-upload all files in a files array ────────────────────────────────────
async function reuploadFiles(
  files: EmbeddedFile[] | string | null | undefined,
): Promise<string> {
  if (!files) return "[]";

  // v1 export: files field is already a JSON string — parse and clean it
  if (typeof files === "string") {
    try {
      const parsed: unknown = JSON.parse(files);
      if (!Array.isArray(parsed)) return files;
      const clean = (parsed as EmbeddedFile[]).map(
        ({ _data: _, _mime: __, _embedded: ___, ...rest }) => rest,
      );
      return JSON.stringify(clean);
    } catch {
      return files;
    }
  }

  const reuploaded = await Promise.all(files.map(reuploadFile));
  return JSON.stringify(reuploaded);
}

// ─── Route ───────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { role, id: userId } = session.user;
    if (!["ADMIN", "PROJECT_MANAGER"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Parse request body safely ───────────────────────────────────────────
    let body: ImportPayload;
    try {
      body = (await req.json()) as ImportPayload;
    } catch (parseErr) {
      console.error("Failed to parse import JSON:", parseErr);
      return NextResponse.json(
        { error: "Invalid JSON: could not parse import file" },
        { status: 400 },
      );
    }

    if (!body || !body.project?.name) {
      return NextResponse.json(
        { error: "Invalid import file: missing project data" },
        { status: 400 },
      );
    }

    // ── Re-upload project files ─────────────────────────────────────────────
    let projectFilesJson = "[]";
    try {
      projectFilesJson = await reuploadFiles(body.project.files);
    } catch (err) {
      console.warn("Project file re-upload failed, continuing:", err);
    }

    // ── Create new project ──────────────────────────────────────────────────
    const newProjectId = nanoid();

    await db.insert(projects).values({
      id: newProjectId,
      name: body.project.name,
      client_name: body.project.client_name ?? null,
      website_url: body.project.website_url ?? null,
      fiverr_order_id: body.project.fiverr_order_id ?? null,
      body: body.project.body ?? null,
      status:
        (body.project.status as
          | "PLANNING"
          | "ACTIVE"
          | "IN_QA"
          | "ON_HOLD"
          | "COMPLETED"
          | "CANCELLED") ?? "PLANNING",
      files: projectFilesJson === "[]" ? null : projectFilesJson,
      created_by: userId,
    });

    // ── Create tasks ────────────────────────────────────────────────────────
    const taskIdMap: Record<string, string> = {};

    const taskInserts = await Promise.all(
      (body.tasks ?? []).map(async (t) => {
        const newTaskId = nanoid();
        taskIdMap[t.id] = newTaskId;

        // Re-upload task files
        let taskFilesJson = "[]";
        try {
          taskFilesJson = await reuploadFiles(t.files);
        } catch (err) {
          console.warn(`Task file re-upload failed for "${t.title}":`, err);
        }

        // ── Resolve assignees ───────────────────────────────────────────────
        // If the original user exists in this system → keep them as assignee.
        // If not (different system/org) → fall back to the importer.
        const [assignedTo, assignedBy, qaAssignedTo] = await Promise.all([
          resolveUserId(t.assigned_to_id, userId),
          resolveUserId(t.assigned_by_id, userId),
          resolveUserIdNullable(t.qa_assigned_to_id),
        ]);

        return {
          id: newTaskId,
          project_id: newProjectId,
          title: t.title,
          description: t.description ?? null,
          team_type: t.team_type,
          priority: t.priority,
          status: t.status,
          files: taskFilesJson === "[]" ? null : taskFilesJson,
          estimated_minutes: t.estimated_minutes ?? null,
          due_date: t.due_date ? new Date(t.due_date) : null,
          rework_count: t.rework_count ?? 0,
          started_at: t.started_at ? new Date(t.started_at) : null,
          completed_at: t.completed_at ? new Date(t.completed_at) : null,
          assigned_to: assignedTo,
          assigned_by: assignedBy,
          qa_assigned_to: qaAssignedTo,
        };
      }),
    );

    if (taskInserts.length > 0) {
      await db.insert(tasks).values(taskInserts);
    }

    // ── Create notes ────────────────────────────────────────────────────────
    const noteInserts = await Promise.all(
      (body.notes ?? [])
        .filter((n) => taskIdMap[n.task_id])
        .map(async (n) => {
          let finalMetadata = n.metadata;

          try {
            if (
              n._embeddedMetadata &&
              Array.isArray(n._embeddedMetadata) &&
              n._embeddedMetadata.length > 0
            ) {
              const reuploaded = await Promise.all(
                n._embeddedMetadata.map(reuploadFile),
              );

              try {
                const orig: unknown = n.metadata
                  ? JSON.parse(n.metadata)
                  : null;
                if (
                  orig &&
                  !Array.isArray(orig) &&
                  typeof orig === "object" &&
                  "files" in orig
                ) {
                  finalMetadata = JSON.stringify({ files: reuploaded });
                } else {
                  finalMetadata = JSON.stringify(reuploaded);
                }
              } catch {
                finalMetadata = JSON.stringify(reuploaded);
              }
            } else if (n.metadata) {
              // Clean any accidentally embedded binary from existing metadata
              try {
                const parsed: unknown = JSON.parse(n.metadata);
                if (
                  parsed &&
                  typeof parsed === "object" &&
                  !Array.isArray(parsed) &&
                  "files" in parsed
                ) {
                  const filesArr = (parsed as { files: EmbeddedFile[] }).files;
                  const clean = filesArr.map(
                    ({ _data: _, _mime: __, _embedded: ___, ...rest }) => rest,
                  );
                  finalMetadata = JSON.stringify({ files: clean });
                } else if (Array.isArray(parsed)) {
                  const clean = (parsed as EmbeddedFile[]).map(
                    ({ _data: _, _mime: __, _embedded: ___, ...rest }) => rest,
                  );
                  finalMetadata = JSON.stringify(clean);
                }
              } catch {
                // metadata is not JSON — keep as-is
              }
            }
          } catch (err) {
            console.warn("Note metadata processing failed:", err);
          }

          return {
            id: nanoid(),
            task_id: taskIdMap[n.task_id]!,
            user_id: userId,
            note: n.note,
            note_type: n.note_type,
            metadata: finalMetadata ?? null,
          };
        }),
    );

    if (noteInserts.length > 0) {
      await db.insert(taskNotes).values(noteInserts);
    }

    return NextResponse.json({
      success: true,
      project_id: newProjectId,
      imported: {
        tasks: taskInserts.length,
        notes: noteInserts.length,
      },
    });
  } catch (err) {
    console.error("Import error:", err);
    const message =
      err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json(
      { error: `Import failed: ${message}` },
      { status: 500 },
    );
  }
}
