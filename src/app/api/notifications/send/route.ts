// app/api/notifications/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { notifications, pushSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sendPushNotification } from "@/lib/push/utils";
import type { NotificationTypeName } from "@/lib/notifications/service";
// ✅ Import SSE broadcaster — pushes count delta to open clients instantly
import { broadcastNotification } from "../events/route";
import { pusherServer } from "@/lib/pusher";

interface SendNotificationBody {
  userIds: string[];
  pushUserIds?: string[];
  taskId: string;
  type: NotificationTypeName;
  title?: string;
  message?: string;
}

function getDefaultTitle(type: NotificationTypeName): string {
  const titles: Record<NotificationTypeName, string> = {
    TASK_ASSIGNED: "New Task Assigned",
    TASK_COMPLETED: "Task Completed",
    QA_REVIEWED: "Task Reviewed",
    READY_FOR_ASSIGNMENT: "Task Ready for Assignment",
    TIME_EXCEEDED: "Time Exceeded",
    HELP_REQUEST: "Help Requested",
    TASK_APPROVED: "Task Approved",
    TASK_REWORK: "Task Requires Rework",
    TASK_RESUBMITTED: "Task Resubmitted",
  };
  return titles[type];
}

function getDefaultMessage(type: NotificationTypeName): string {
  const messages: Record<NotificationTypeName, string> = {
    TASK_ASSIGNED: "You have been assigned a new task.",
    TASK_COMPLETED: "A task has been completed.",
    QA_REVIEWED: "A task has been reviewed by QA.",
    READY_FOR_ASSIGNMENT: "A task is ready to be assigned.",
    TIME_EXCEEDED: "A task has exceeded its estimated time.",
    HELP_REQUEST: "Someone has requested help on a task.",
    TASK_APPROVED: "Your task has been approved.",
    TASK_REWORK: "Your task requires rework.",
    TASK_RESUBMITTED: "A task has been resubmitted for review.",
  };
  return messages[type];
}

async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.user_id, userId));

  for (const sub of subs) {
    try {
      await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
    } catch (err) {
      console.error(`Push failed for user ${userId} sub ${sub.id}:`, err);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as SendNotificationBody;
    const { taskId, type, pushUserIds } = body;

    if (!taskId || !type) {
      return NextResponse.json(
        { error: "taskId and type are required" },
        { status: 400 },
      );
    }
    if (!body.userIds?.length) {
      return NextResponse.json(
        { error: "userIds is required" },
        { status: 400 },
      );
    }

    const allDbUserIds = [...new Set(body.userIds)];
    const pushTargetIds =
      pushUserIds && pushUserIds.length > 0
        ? [...new Set(pushUserIds)]
        : allDbUserIds;

    const resolvedTitle = body.title ?? getDefaultTitle(type);
    const resolvedMessage = body.message ?? getDefaultMessage(type);

    let sent = 0,
      skipped = 0,
      failed = 0;

    // ── Step 1: Insert DB notifications (with dedup) ─────────────────────────
    const insertedUserIds: string[] = [];

    await Promise.allSettled(
      allDbUserIds.map(async (userId) => {
        try {
          const existing = await db
            .select({ id: notifications.id })
            .from(notifications)
            .where(
              and(
                eq(notifications.user_id, userId),
                eq(notifications.task_id, taskId),
                eq(notifications.type, type),
                eq(notifications.is_read, false),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            return;
          }

          await db.insert(notifications).values({
            id: uuidv4(),
            user_id: userId,
            task_id: taskId,
            type,
            title: resolvedTitle,
            message: resolvedMessage,
            is_read: false,
          });

          insertedUserIds.push(userId);
          sent++;
        } catch {
          failed++;
        }
      }),
    );

    // ── Step 2: SSE broadcast — increment badge for each recipient ────────────
    // Only broadcast for users who actually got a new notification (not skipped).
    // unreadDelta: 1 means the client adds 1 to their local count — no DB query.
    for (const userId of insertedUserIds) {
      await pusherServer.trigger(`private-user-${userId}`, "notification", {
        unreadDelta: 1,
      });
    }

    // ── Step 3: Push notifications ────────────────────────────────────────────
    // Push fires independently of the DB dedup — a user may have an unread DB
    // notification but still needs the push alert if they haven't opened the app.
    await Promise.allSettled(
      pushTargetIds.map((userId) =>
        sendPushToUser(userId, {
          title: resolvedTitle,
          body: resolvedMessage,
          data: { taskId, type, url: `/tasks/${taskId}` },
        }),
      ),
    );

    return NextResponse.json({ success: true, sent, skipped, failed });
  } catch (error) {
    console.error("Error sending notification:", error);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 },
    );
  }
}
