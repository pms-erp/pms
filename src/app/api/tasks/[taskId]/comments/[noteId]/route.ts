import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Context =
  | { params: { taskId: string; noteId: string } }
  | { params: Promise<{ taskId: string; noteId: string }> };

async function extractParams(
  context: Context,
): Promise<{ taskId: string; noteId: string } | null> {
  if (typeof (context.params as Promise<unknown>).then === "function") {
    return (
      (await (context.params as Promise<{
        taskId: string;
        noteId: string;
      }>)) ?? null
    );
  }
  return context.params as { taskId: string; noteId: string };
}

export async function DELETE(req: NextRequest, context: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = await extractParams(context);
    if (!params) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    const { noteId } = params;

    // Only the author or ADMIN/PROJECT_MANAGER can delete
    const note = await db
      .select({ user_id: taskNotes.user_id })
      .from(taskNotes)
      .where(eq(taskNotes.id, noteId))
      .limit(1);

    if (note.length === 0) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAuthor = note[0].user_id === session.user.id;
    const isPrivileged = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"].includes(
      session.user.role,
    );

    if (!isAuthor && !isPrivileged) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(taskNotes).where(eq(taskNotes.id, noteId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 },
    );
  }
}
