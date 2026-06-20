// app/api/asana/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projects, tasks, taskNotes, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { uploadToStorage } from "@/lib/server-storage";

import type {
  AsanaTask,
  AsanaAttachment,
  AsanaStory,
  AsanaUser,
  AsanaImportRequest,
  AsanaImportResult,
  AsanaImportedFile,
  ServerUploadResult,
} from "@/lib/asana/types";
import { toAsanaImportedFile, toStoredFiles } from "@/lib/asana/types";

const ASANA_BASE = "https://app.asana.com/api/1.0";

// ✅ Fixed: Added 'data' property name
interface AsanaPage<T> {
  data: T[];
  next_page: { offset: string } | null;
}

async function asanaGetOne<T = unknown>(
  path: string,
  token: string,
): Promise<T> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { errors?: { message: string }[] }).errors?.[0]?.message ??
        `Asana error ${res.status} on ${path}`,
    );
  }
  // ✅ Fixed: Added 'data' property name
  const data = (await res.json()) as { data: T };
  return data.data;
}

async function asanaGetAll<T = unknown>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(`${ASANA_BASE}${path}`);
    url.searchParams.set("limit", "100");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { errors?: { message: string }[] }).errors?.[0]?.message ??
          `Asana error ${res.status} on ${path}`,
      );
    }

    const page = (await res.json()) as AsanaPage<T>;
    results.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return results;
}

function mapStatus(
  completed: boolean,
  sectionName: string,
): "IN_PROGRESS" | "WAITING_FOR_QA" | "APPROVED" | "REWORK" {
  if (completed) return "APPROVED";
  const s = sectionName.toLowerCase();
  if (s.includes("qa") || s.includes("review")) return "WAITING_FOR_QA";
  if (s.includes("rework") || s.includes("fix")) return "REWORK";
  return "IN_PROGRESS";
}

function mapPriority(
  customFields: { name: string; display_value: string | null }[],
): "LOW" | "MEDIUM" | "HIGH" {
  const pField = customFields.find((f) => f.name.toLowerCase() === "priority");
  const val = (pField?.display_value ?? "").toLowerCase();
  if (val.includes("high") || val.includes("urgent")) return "HIGH";
  if (val.includes("low")) return "LOW";
  return "MEDIUM";
}

async function resolveUserId(
  asanaUser: AsanaUser | null,
  fallbackId: string,
  emailCache: Map<string, string>,
): Promise<string> {
  if (!asanaUser?.email) return fallbackId;

  const cached = emailCache.get(asanaUser.email);
  if (cached) return cached;

  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, asanaUser.email))
    .limit(1);

  const id = found?.id ?? fallbackId;
  emailCache.set(asanaUser.email, id);
  return id;
}

function getMimeType(fileName: string): string {
  const ext = fileName.match(/\.[^/.]+$/)?.[0]?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".csv": "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

async function importAttachment(
  att: AsanaAttachment,
  asanaToken: string,
  folder: string,
  source: "task_description" | "comment" = "task_description",
): Promise<AsanaImportedFile | null> {
  const downloadUrl = att.download_url ?? att.view_url;
  if (!downloadUrl) return null;

  const EXTERNAL_DOMAINS = [
    "figma.com",
    "google.com",
    "docs.google.com",
    "drive.google.com",
    "notion.so",
    "dropbox.com",
    "loom.com",
    "youtube.com",
    "github.com",
    "gitlab.com",
    "trello.com",
    "miro.com",
    "whimsical.com",
    "invisionapp.com",
    "zeplin.io",
    "confluence.atlassian.com",
    "lucid.app",
  ];
  if (EXTERNAL_DOMAINS.some((d) => downloadUrl.includes(d))) {
    console.warn(`Skipping external link: ${downloadUrl}`);
    return null;
  }

  try {
    const fileRes = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${asanaToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!fileRes.ok) return null;

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const uploaded: ServerUploadResult = await uploadToStorage({
      fileName: att.name,
      fileType: getMimeType(att.name),
      fileSize: buffer.length,
      fileBuffer: buffer,
      folder,
    });

    return toAsanaImportedFile(att, uploaded, source);
  } catch (err) {
    console.warn(`Attachment upload failed for "${att.name}":`, err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role, id: importerId } = session.user;
  if (!["ADMIN", "PROJECT_MANAGER"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as AsanaImportRequest;
  if (!body.token || !body.projectGids?.length) {
    return NextResponse.json(
      { error: "token and projectGids required" },
      { status: 400 },
    );
  }

  const teamType = body.teamType || "DEVELOPER";
  const emailCache = new Map<string, string>();

  const results: AsanaImportResult = {
    success: false,
    projects_imported: 0,
    tasks_imported: 0,
    notes_imported: 0,
    files_imported: 0,
    errors: [],
  };

  for (const projectGid of body.projectGids) {
    try {
      const ap = await asanaGetOne<{
        gid: string;
        name: string;
        notes: string;
        created_at: string;
      }>(
        `/projects/${projectGid}?opt_fields=gid,name,notes,created_at`,
        body.token,
      );

      const newProjectId = nanoid();
      await db.insert(projects).values({
        id: newProjectId,
        name: ap.name,
        body: ap.notes || null,
        status: "ACTIVE",
        created_by: importerId,
      });
      results.projects_imported++;

      const asanaTasks = await asanaGetAll<AsanaTask>("/tasks", body.token, {
        project: projectGid,
        opt_fields:
          "gid,name,notes,completed,due_on,assignee.name,assignee.email,memberships.section.name,custom_fields.name,custom_fields.display_value,created_at",
      });

      for (const at of asanaTasks) {
        if (!at.name?.trim()) continue;

        try {
          const assignedTo = await resolveUserId(
            at.assignee,
            importerId,
            emailCache,
          );

          const sectionName = at.memberships?.[0]?.section?.name ?? "";
          const status = mapStatus(at.completed, sectionName);
          const priority = mapPriority(at.custom_fields ?? []);

          let estimatedMinutes: number | null = null;
          if (at.due_on) {
            const due = new Date(at.due_on);
            const now = new Date();
            const mins = Math.round((due.getTime() - now.getTime()) / 60000);
            if (mins > 0) estimatedMinutes = mins;
          }

          const newTaskId = nanoid();

          const taskAttachments = await asanaGetAll<AsanaAttachment>(
            "/attachments",
            body.token,
            {
              parent: at.gid,
              opt_fields: "gid,name,download_url,view_url,size,created_at",
            },
          );

          const taskFiles: AsanaImportedFile[] = [];
          if (taskAttachments.length > 0) {
            const folder = `asana-import/${newProjectId}`;
            for (const att of taskAttachments) {
              const uploaded = await importAttachment(
                att,
                body.token,
                folder,
                "task_description",
              );
              if (uploaded) {
                taskFiles.push(uploaded);
                results.files_imported++;
              }
            }
          }

          await db.insert(tasks).values({
            id: newTaskId,
            project_id: newProjectId,
            team_type: teamType,
            title: at.name.trim(),
            description: at.notes || null,
            priority,
            status,
            assigned_to: assignedTo,
            assigned_by: importerId,
            qa_assigned_to: null,
            estimated_minutes: estimatedMinutes,
            due_date: at.due_on ? new Date(at.due_on) : null,
            rework_count: 0,
            started_at: null,
            completed_at: status === "APPROVED" ? new Date() : null,
            files:
              taskFiles.length > 0
                ? JSON.stringify(toStoredFiles(taskFiles))
                : null,
          });
          results.tasks_imported++;

          try {
            const stories = await asanaGetAll<AsanaStory>(
              `/tasks/${at.gid}/stories`,
              body.token,
              {
                opt_fields:
                  "gid,type,text,created_by.name,created_by.email,created_at,attachments.name,attachments.download_url,attachments.view_url,attachments.size,attachments.created_at",
              },
            );

            const commentStories = stories.filter((s) => {
              if (s.type !== "comment") return false;
              return !!(s.text?.trim() || s.attachments?.length);
            });

            for (const story of commentStories) {
              const noteAuthor = await resolveUserId(
                story.created_by,
                importerId,
                emailCache,
              );

              const commentFiles: AsanaImportedFile[] = [];

              if (story.attachments?.length) {
                const folder = `asana-import/${newProjectId}/comments`;
                for (const att of story.attachments) {
                  const uploaded = await importAttachment(
                    att,
                    body.token,
                    folder,
                    "comment",
                  );
                  if (uploaded) {
                    commentFiles.push(uploaded);
                    results.files_imported++;
                  }
                }
              }

              await db.insert(taskNotes).values({
                id: nanoid(),
                task_id: newTaskId,
                user_id: noteAuthor,
                note: story.text?.trim()
                  ? `<p>${story.text.trim().replace(/\n/g, "<br/>")}</p>`
                  : "<p>[Attachment]</p>",
                note_type: "COMMENT",
                metadata:
                  commentFiles.length > 0
                    ? JSON.stringify(toStoredFiles(commentFiles))
                    : null,
              });
              results.notes_imported++;
            }
          } catch (storyErr) {
            console.warn(`Stories fetch failed for task ${at.gid}:`, storyErr);
          }
        } catch (taskErr) {
          const msg =
            taskErr instanceof Error ? taskErr.message : String(taskErr);
          results.errors.push(`Task "${at.name}": ${msg}`);
        }
      }
    } catch (projectErr) {
      const msg =
        projectErr instanceof Error ? projectErr.message : String(projectErr);
      results.errors.push(`Project ${projectGid}: ${msg}`);
    }
  }

  results.success = true;
  return NextResponse.json<AsanaImportResult>(results);
}
