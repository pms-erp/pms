// Save as: app/api/tasks/[taskId]/notes/[noteId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Context =
  | { params: { taskId: string; noteId: string } }
  | { params: Promise<{ taskId: string; noteId: string }> };

async function extractParams(context: Context) {
  const p =
    typeof (context.params as Promise<unknown>).then === "function"
      ? await (context.params as Promise<{ taskId: string; noteId: string }>)
      : (context.params as { taskId: string; noteId: string });
  return p;
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId, noteId } = await extractParams(context);
    if (!taskId || !noteId) {
      return NextResponse.json(
        { error: "Invalid parameters" },
        { status: 400 },
      );
    }

    const body = (await req.json()) as {
      note?: string;
      metadata?: string | null;
    };
    if (body.note !== undefined && !body.note?.trim()) {
      return NextResponse.json(
        { error: "Note text cannot be empty" },
        { status: 400 },
      );
    }

    // Only allow the note's author to edit it
    const existing = await db
      .select({
        id: taskNotes.id,
        user_id: taskNotes.user_id,
        metadata: taskNotes.metadata,
      })
      .from(taskNotes)
      .where(and(eq(taskNotes.id, noteId), eq(taskNotes.task_id, taskId)))
      .limit(1);

    if (!existing.length) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (existing[0].user_id !== session.user.id) {
      return NextResponse.json(
        { error: "Forbidden — you can only edit your own feedback" },
        { status: 403 },
      );
    }

    // ── Detect removed attachments and delete from storage ───────────────────
    if (body.metadata !== undefined) {
      try {
        const oldMeta: unknown = existing[0].metadata
          ? JSON.parse(existing[0].metadata)
          : null;
        const newMeta: unknown = body.metadata
          ? JSON.parse(body.metadata)
          : null;

        const oldAtts = Array.isArray(oldMeta)
          ? oldMeta
          : ((oldMeta as { files?: unknown[] })?.files ?? []);
        const newAtts = Array.isArray(newMeta)
          ? newMeta
          : ((newMeta as { files?: unknown[] })?.files ?? []);

        const oldIds = new Set(
          (oldAtts as { public_id?: string }[])
            .map((a) => a.public_id)
            .filter(Boolean),
        );
        const newIds = new Set(
          (newAtts as { public_id?: string }[])
            .map((a) => a.public_id)
            .filter(Boolean),
        );

        const removedIds = [...oldIds].filter((id) => !newIds.has(id));

        if (removedIds.length > 0) {
          const oldAttMap = new Map(
            (oldAtts as { public_id?: string }[]).map((a) => [a.public_id, a]),
          );
          const toDelete = removedIds
            .map((id) => {
              const att = oldAttMap.get(id);
              if (!att?.public_id) return null;
              return {
                public_id: att.public_id,
                resource_type: (att as { resource_type?: string })
                  .resource_type,
                storage: (att as { storage?: "cloudinary" | "r2" }).storage,
                url: (att as { url?: string }).url,
              };
            })
            .filter(Boolean) as Array<{
            public_id: string;
            resource_type?: string;
            storage?: "cloudinary" | "r2";
            url?: string;
          }>;

          // Fire-and-forget delete from storage
          if (toDelete.length > 0) {
            import("@/lib/server-storage").then(
              ({ deleteFilesFromStorage }) => {
                deleteFilesFromStorage(toDelete).catch((err) =>
                  console.warn(
                    "Failed to delete removed attachments from storage:",
                    err,
                  ),
                );
              },
            );
          }
        }
      } catch {
        // Skip if metadata parsing fails
      }
    }

    // ── Update the note in DB ────────────────────────────────────────────────
    const updateFields: { note?: string; metadata?: string | null } = {};
    if (body.note !== undefined) updateFields.note = body.note.trim();
    if (body.metadata !== undefined) updateFields.metadata = body.metadata;

    await db
      .update(taskNotes)
      .set(updateFields)
      .where(eq(taskNotes.id, noteId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Edit note error:", error);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 },
    );
  }
}
