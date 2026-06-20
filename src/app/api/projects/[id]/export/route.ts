// app/api/projects/[id]/export/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projects, tasks, taskNotes } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────
interface StoredFile {
  url: string;
  public_id: string;
  name?: string;
  original_name?: string;
  resource_type?: string;
  size?: number;
  storage?: "cloudinary" | "r2";
}

interface EmbeddedFile extends StoredFile {
  _data?: string; // base64 encoded file bytes
  _mime?: string; // mime type for re-upload
  _embedded: boolean; // true = file data is embedded, false = URL only
}

// ─── Download one file from its URL and return base64 ────────────────────────
async function fetchAsBase64(
  url: string,
  originalResourceType?: string,
): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;

    let mime = res.headers.get("content-type") ?? "application/octet-stream";

    // Cloudinary sometimes returns generic mime for raw files — fix from URL/name
    if (mime === "application/octet-stream" || mime.startsWith("text/html")) {
      if (url.endsWith(".pdf")) mime = "application/pdf";
      else if (url.endsWith(".docx"))
        mime =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      else if (url.endsWith(".xlsx"))
        mime =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      else if (url.endsWith(".doc")) mime = "application/msword";
      else if (url.endsWith(".xls")) mime = "application/vnd.ms-excel";
      else if (url.endsWith(".zip")) mime = "application/zip";
      else if (url.endsWith(".txt")) mime = "text/plain";
      else if (url.endsWith(".csv")) mime = "text/csv";
      else if (url.endsWith(".mp3")) mime = "audio/mpeg";
      else if (url.endsWith(".wav")) mime = "audio/wav";
    }

    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString("base64");
    return { data, mime };
  } catch {
    return null;
  }
}

// ─── Parse files JSON and embed bytes ────────────────────────────────────────
async function embedFiles(
  filesJson: string | null | undefined,
): Promise<EmbeddedFile[]> {
  if (!filesJson) return [];
  let parsed: StoredFile[];
  try {
    const raw: unknown = JSON.parse(filesJson);
    if (!Array.isArray(raw)) return [];
    parsed = raw as StoredFile[];
  } catch {
    return [];
  }

  const embedded = await Promise.all(
    parsed.map(async (f): Promise<EmbeddedFile> => {
      if (!f.url) return { ...f, _embedded: false };
      const fetched = await fetchAsBase64(f.url, f.resource_type);
      if (!fetched) return { ...f, _embedded: false };
      return {
        ...f,
        // Always preserve the original resource_type and storage so import re-uploads correctly
        resource_type: f.resource_type ?? "image",
        storage: f.storage,
        _data: fetched.data,
        _mime: fetched.mime,
        _embedded: true,
      };
    }),
  );

  return embedded;
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user;
    if (!["ADMIN", "PROJECT_MANAGER"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: projectId } =
      "then" in context.params ? await context.params : context.params;

    // ── Fetch project ─────────────────────────────────────────────────────────
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // ── Fetch all tasks ───────────────────────────────────────────────────────
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.project_id, projectId));

    // ── Fetch all notes ───────────────────────────────────────────────────────
    const taskIds = projectTasks.map((t) => t.id);
    let notes: (typeof taskNotes.$inferSelect)[] = [];
    if (taskIds.length > 0) {
      const results = await Promise.all(
        taskIds.map((tid) =>
          db.select().from(taskNotes).where(eq(taskNotes.task_id, tid)),
        ),
      );
      notes = results.flat();
    }

    // ── Embed all files (download bytes from storage) ────────────────────────
    // Run project files + all task files in parallel
    const [projectFilesEmbedded, ...taskFilesEmbedded] = await Promise.all([
      embedFiles(project.files),
      ...projectTasks.map((t) => embedFiles(t.files)),
    ]);

    // Also embed note metadata attachments (QA feedback images etc.)
    const notesWithEmbeddedFiles = await Promise.all(
      notes.map(async (n) => {
        if (!n.metadata) return { ...n, _embeddedMetadata: null };
        // metadata is JSON with a "files" array
        let meta: unknown;
        try {
          meta = JSON.parse(n.metadata);
        } catch {
          return { ...n, _embeddedMetadata: null };
        }

        // Support both { files: [...] } and direct array
        const fileArr: StoredFile[] = Array.isArray(meta)
          ? (meta as StoredFile[])
          : ((meta as { files?: StoredFile[] }).files ?? []);

        const embedded = await embedFiles(JSON.stringify(fileArr));
        return { ...n, _embeddedMetadata: embedded };
      }),
    );

    // ── Build export payload ──────────────────────────────────────────────────
    const exportData = {
      __version: "2.0", // v2 = includes embedded file data
      __exported_at: new Date().toISOString(),
      __exported_by: session.user.name ?? session.user.email,
      project: {
        id: project.id,
        name: project.name,
        client_name: project.client_name,
        website_url: project.website_url,
        fiverr_order_id: project.fiverr_order_id,
        body: project.body,
        status: project.status,
        files: projectFilesEmbedded,
        created_at: project.created_at,
        updated_at: project.updated_at,
      },
      tasks: projectTasks.map((t, i) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        team_type: t.team_type,
        priority: t.priority,
        status: t.status,
        files: taskFilesEmbedded[i] ?? [],
        estimated_minutes: t.estimated_minutes,
        due_date: t.due_date,
        rework_count: t.rework_count,
        started_at: t.started_at,
        completed_at: t.completed_at,
        created_at: t.created_at,
        updated_at: t.updated_at,
        assigned_to_id: t.assigned_to,
        assigned_by_id: t.assigned_by,
        qa_assigned_to_id: t.qa_assigned_to,
      })),
      notes: notesWithEmbeddedFiles.map((n) => ({
        id: n.id,
        task_id: n.task_id,
        note: n.note,
        note_type: n.note_type,
        metadata: n.metadata,
        _embeddedMetadata: n._embeddedMetadata,
        created_at: n.created_at,
        user_id: n.user_id,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `${project.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_export_${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
