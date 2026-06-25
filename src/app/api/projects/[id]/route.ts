import { db } from "@/db";
import { projects, tasks, taskNotes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canCreateProject } from "@/lib/projects/permissions";
import { z } from "zod";
import { v2 as cloudinary } from "cloudinary";
import { deleteFilesFromStorage } from "@/lib/server-storage";
import {
  logLeadActivityForProject,
  createFeedbackAttemptsForProject,
} from "@/lib/leads/lead-project-service";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ─── Helper ───────────────────────────────────────────────────────────────────

interface StoredFile {
  public_id?: string;
  resource_type?: string;
  storage?: "cloudinary" | "r2";
  url?: string;
}

function collectFiles(filesJson: string | null | undefined): {
  public_id: string;
  resource_type?: string;
  storage?: "cloudinary" | "r2";
  url?: string;
}[] {
  if (!filesJson) return [];
  try {
    const arr: unknown = JSON.parse(filesJson);
    if (!Array.isArray(arr)) return [];
    return (arr as StoredFile[])
      .filter((f) => !!f?.public_id || !!f?.url)
      .map((f) => ({
        public_id: f.public_id ?? "",
        resource_type: f.resource_type,
        storage: f.storage,
        url: f.url,
      }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const patchProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Project name must be at least 3 characters")
    .optional(),
  client_name: z.string().trim().optional().nullable(),
  website_url: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^https?:\/\/.+\..+/.test(val),
      "Must be a valid URL",
    ),
  fiverr_order_id: z.string().trim().optional().nullable(),
  status: z
    .enum(["PLANNING", "ACTIVE", "IN_QA", "ON_HOLD", "COMPLETED", "CANCELLED"])
    .optional(),
  body: z.string().optional().nullable(),
  files: z.string().optional().nullable(),
});

// PATCH — update project fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!canCreateProject(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const parsed = patchProjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    // Fetch existing to check current status (needed for completion transition)
    const existing = await db
      .select({
        id: projects.id,
        created_by: projects.created_by,
        status: projects.status,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .then((r) => r[0]);

    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Build update payload — only include provided keys
    const data = parsed.data;
    const updatePayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      updatePayload[k] = v ?? null;
    }

    await db.update(projects).set(updatePayload).where(eq(projects.id, id));

    // ── Lead lifecycle hook: fire on ANY status change ──────────────────────
    // Non-blocking — project PATCH always succeeds even if this errors
    if (data.status && data.status !== existing.status) {
      const oldStatus = existing.status;
      const newStatus = data.status;

      // Log status change to lead timeline
      logLeadActivityForProject({
        project_id: id,
        action:
          newStatus === "COMPLETED" ? "PROJECT_COMPLETED" : "STATUS_CHANGED",
        summary: `Project status changed from ${oldStatus.replace(/_/g, " ")} to ${newStatus.replace(/_/g, " ")}`,
        performed_by: session.user.id,
        performed_by_name: session.user.name,
      }).catch((err) => {
        console.error(
          "[lead lifecycle] logLeadActivityForProject failed:",
          err,
        );
      });

      // If status changed to COMPLETED, also create feedback attempts
      if (newStatus === "COMPLETED") {
        createFeedbackAttemptsForProject({
          project_id: id,
          performed_by: session.user.id,
          performed_by_name: session.user.name,
        }).catch((err) => {
          console.error(
            "[lead lifecycle] createFeedbackAttemptsForProject failed:",
            err,
          );
        });
      }
    }

    const updated = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .then((r) => r[0]);

    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    console.error("PATCH /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}

// DELETE — full cleanup
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!canCreateProject(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Fetch project
    const existing = await db
      .select({
        id: projects.id,
        created_by: projects.created_by,
        files: projects.files,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .then((r) => r[0]);

    if (!existing)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ── Collect ALL files to delete from storage ─────────────────────────────
    type FileToDelete = {
      public_id: string;
      resource_type?: string;
      storage?: "cloudinary" | "r2";
      url?: string;
    };

    const filesToDelete: FileToDelete[] = [];

    function parseFiles(filesJson: string | null | undefined): FileToDelete[] {
      if (!filesJson) return [];
      try {
        const arr: unknown = JSON.parse(filesJson);
        if (!Array.isArray(arr)) return [];
        return (
          arr as {
            public_id?: string;
            resource_type?: string;
            storage?: "cloudinary" | "r2";
            url?: string;
          }[]
        )
          .filter((f) => !!f?.public_id)
          .map((f) => ({
            public_id: f.public_id!,
            resource_type: f.resource_type,
            storage: f.storage,
            url: f.url,
          }));
      } catch {
        return [];
      }
    }

    // 1. Project-level files
    filesToDelete.push(...parseFiles(existing.files));

    // 2. Fetch all tasks and collect their files
    const projectTasks = await db
      .select({ id: tasks.id, files: tasks.files })
      .from(tasks)
      .where(eq(tasks.project_id, id));

    for (const t of projectTasks) {
      filesToDelete.push(...parseFiles(t.files));
    }

    // 3. Fetch ALL comment attachments from taskNotes for all tasks in this project
    const taskIds = projectTasks.map((t) => t.id);

    if (taskIds.length > 0) {
      const { inArray } = await import("drizzle-orm");

      const allComments = await db
        .select({ metadata: taskNotes.metadata })
        .from(taskNotes)
        .where(inArray(taskNotes.task_id, taskIds));

      for (const c of allComments) {
        if (c.metadata) {
          try {
            const atts: unknown = JSON.parse(c.metadata);
            const attachments = Array.isArray(atts)
              ? atts
              : ((atts as { files?: unknown[] }).files ?? []);
            for (const a of attachments) {
              if (
                typeof a === "object" &&
                a &&
                "public_id" in a &&
                a.public_id
              ) {
                filesToDelete.push({
                  public_id: a.public_id as string,
                  resource_type: (a as { resource_type?: string })
                    .resource_type,
                  storage: (a as { storage?: "cloudinary" | "r2" }).storage,
                  url: (a as { url?: string }).url,
                });
              }
            }
          } catch {
            // Skip malformed metadata
          }
        }
      }
    }

    console.log(
      `[DELETE Project ${id}] Found ${filesToDelete.length} files to delete from storage`,
    );

    // ── Delete DB records — notes first (FK), then tasks, then project ───────
    if (taskIds.length > 0) {
      await Promise.all(
        taskIds.map((tid) =>
          db.delete(taskNotes).where(eq(taskNotes.task_id, tid)),
        ),
      );
      console.log(
        `[DELETE Project ${id}] Deleted ${taskIds.length} task notes`,
      );
    }

    await db.delete(tasks).where(eq(tasks.project_id, id));
    console.log(`[DELETE Project ${id}] Deleted ${projectTasks.length} tasks`);

    await db.delete(projects).where(eq(projects.id, id));
    console.log(`[DELETE Project ${id}] Deleted project`);

    // ── Delete files from storage (Cloudinary + R2) after DB cleanup ─────────
    if (filesToDelete.length > 0) {
      try {
        const { deleteFilesFromStorage } = await import("@/lib/server-storage");
        await deleteFilesFromStorage(filesToDelete);
        console.log(
          `[DELETE Project ${id}] Successfully deleted ${filesToDelete.length} files from storage`,
        );
      } catch (err) {
        console.error(
          `[DELETE Project ${id}] Storage cleanup failed (non-fatal):`,
          err,
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id]:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
