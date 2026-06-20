import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes, tasks, users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createNotification } from "@/lib/notifications/service";
import { sendPushNotification } from "@/lib/push/utils";
import { pushSubscriptions } from "@/db/schema";

type NoteType = "COMMENT" | "APPROVAL" | "REJECTION" | "FEEDBACK_IMAGE";

type RouteContext =
  | { params: { taskId: string } }
  | { params: Promise<{ taskId: string }> };

async function extractTaskId(context: RouteContext): Promise<string | null> {
  if (typeof (context.params as Promise<unknown>).then === "function") {
    const p = await (context.params as Promise<{ taskId: string }>);
    return p?.taskId ?? null;
  }
  return (context.params as { taskId: string }).taskId ?? null;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await extractTaskId(context);
    if (!taskId) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const comments = await db
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
      .orderBy(asc(taskNotes.created_at));

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = await extractTaskId(context);
    if (!taskId) {
      return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    }

    const body = (await req.json()) as {
      note: string;
      note_type?: NoteType;
      metadata?: string;
    };

    if (!body.note?.trim()) {
      return NextResponse.json(
        { error: "Comment cannot be empty" },
        { status: 400 },
      );
    }

    const id = uuidv4();

    await db.insert(taskNotes).values({
      id,
      task_id: taskId,
      user_id: session.user.id,
      note: body.note.trim(),
      note_type: body.note_type ?? "COMMENT",
      metadata: body.metadata ?? null,
    });

    // Fetch the inserted comment with user info
    const inserted = await db
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
      .where(eq(taskNotes.id, id))
      .limit(1);

    // ── Notify assignee (fire and forget, never blocks response) ──────────────
    void (async () => {
      try {
        const taskRow = await db
          .select({ assigned_to: tasks.assigned_to, title: tasks.title })
          .from(tasks)
          .where(eq(tasks.id, taskId))
          .limit(1);

        const assigneeId = taskRow[0]?.assigned_to;
        const taskTitle = taskRow[0]?.title ?? "a task";

        // Skip if no assignee or commenter is the assignee
        if (!assigneeId || assigneeId === session.user.id) return;

        const commenter = await db
          .select({ name: users.name, username: users.username })
          .from(users)
          .where(eq(users.id, session.user.id))
          .limit(1);

        const commenterName =
          commenter[0]?.name ?? commenter[0]?.username ?? "Someone";

        const preview = body.note.trim().slice(0, 100);
        const previewText =
          body.note.trim().length > 100 ? `${preview}…` : preview;

        const notifTitle = `New comment on: ${taskTitle}`;
        const notifMessage = `${commenterName}: "${previewText}"`;

        // Insert DB notification
        await createNotification({
          userId: assigneeId,
          taskId,
          type: "TASK_RESUBMITTED", // reusing existing type — visible in /notifications
          title: notifTitle,
          message: notifMessage,
        });

        // Send push directly to assignee
        const subs = await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.user_id, assigneeId));

        for (const sub of subs) {
          try {
            await sendPushNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              {
                title: notifTitle,
                body: notifMessage,
                data: {
                  taskId,
                  type: "TASK_RESUBMITTED",
                  url: `/tasks/${taskId}`,
                },
              },
            );
          } catch (pushErr) {
            console.error("Push failed for sub:", sub.id, pushErr);
          }
        }
      } catch (err) {
        console.error("Comment notification error:", err);
      }
    })();

    return NextResponse.json({ comment: inserted[0] });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 },
    );
  }
}
