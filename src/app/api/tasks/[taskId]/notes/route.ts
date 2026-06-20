// app/api/tasks/[taskId]/notes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes, users } from "@/db/schema"; // ← taskNotes (camelCase), not task_notes
import { eq, and } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { broadcastCommentUpdate } from "../events/route";
import { pusherServer } from "@/lib/pusher";

type Context =
  | { params: { taskId: string } }
  | { params: Promise<{ taskId: string }> };

async function getTaskId(context: Context): Promise<string> {
  const p =
    typeof (context.params as Promise<unknown>).then === "function"
      ? await (context.params as Promise<{ taskId: string }>)
      : (context.params as { taskId: string });
  return p.taskId;
}

// ── GET — fetch all notes/comments for a task ─────────────────────────────────
export async function GET(_req: NextRequest, context: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await getTaskId(context);

    const rows = await db
      .select({
        id: taskNotes.id,
        task_id: taskNotes.task_id,
        user_id: taskNotes.user_id,
        note: taskNotes.note,
        note_type: taskNotes.note_type,
        metadata: taskNotes.metadata,
        created_at: taskNotes.created_at,
        userName: users.name,
        userUsername: users.username,
        userRole: users.role,
      })
      .from(taskNotes)
      .leftJoin(users, eq(taskNotes.user_id, users.id))
      .where(eq(taskNotes.task_id, taskId))
      .orderBy(taskNotes.created_at);

    return NextResponse.json({ comments: rows });
  } catch (error) {
    console.error("GET notes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch notes" },
      { status: 500 },
    );
  }
}

// ── POST — create a new note/comment ─────────────────────────────────────────
export async function POST(req: NextRequest, context: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await getTaskId(context);
    const body = await req.json();
    const { note, note_type = "COMMENT", metadata } = body;

    if (!note?.trim()) {
      return NextResponse.json(
        { error: "Note text is required" },
        { status: 400 },
      );
    }

    const validTypes = ["COMMENT", "APPROVAL", "REJECTION", "FEEDBACK_IMAGE"];
    if (!validTypes.includes(note_type)) {
      return NextResponse.json({ error: "Invalid note type" }, { status: 400 });
    }

    const noteId = uuid();

    await db.insert(taskNotes).values({
      id: noteId,
      task_id: taskId,
      user_id: session.user.id,
      note: note.trim(),
      note_type,
      metadata: metadata ?? null,
    });

    // Return the created note with user info
    const created = await db
      .select({
        id: taskNotes.id,
        task_id: taskNotes.task_id,
        user_id: taskNotes.user_id,
        note: taskNotes.note,
        note_type: taskNotes.note_type,
        metadata: taskNotes.metadata,
        created_at: taskNotes.created_at,
        userName: users.name,
        userUsername: users.username,
        userRole: users.role,
      })
      .from(taskNotes)
      .leftJoin(users, eq(taskNotes.user_id, users.id))
      .where(eq(taskNotes.id, noteId))
      .limit(1);

    await pusherServer.trigger(`task-${taskId}`, "comment_updated", {});

    return NextResponse.json({ comment: created[0] }, { status: 201 });
  } catch (error) {
    console.error("POST note error:", error);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}

// ── DELETE — delete a note ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest, context: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await getTaskId(context);
    const { searchParams } = new URL(req.url);
    const noteId = searchParams.get("noteId");

    if (!noteId) {
      return NextResponse.json(
        { error: "noteId is required" },
        { status: 400 },
      );
    }

    // Only the author can delete their own note
    const existing = await db
      .select({ user_id: taskNotes.user_id })
      .from(taskNotes)
      .where(and(eq(taskNotes.id, noteId), eq(taskNotes.task_id, taskId)))
      .limit(1);

    if (!existing.length) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (existing[0].user_id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(taskNotes).where(eq(taskNotes.id, noteId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE note error:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 },
    );
  }
}
