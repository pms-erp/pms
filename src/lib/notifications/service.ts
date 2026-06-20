import { db } from "@/db";
import { notifications, tasks, pushSubscriptions } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sendPushNotification } from "@/lib/push/utils";

export type NotificationTypeName =
  | "TASK_ASSIGNED"
  | "TASK_COMPLETED"
  | "QA_REVIEWED"
  | "READY_FOR_ASSIGNMENT"
  | "TIME_EXCEEDED"
  | "HELP_REQUEST"
  | "TASK_APPROVED"
  | "TASK_REWORK"
  | "TASK_RESUBMITTED";

interface CreateNotificationParams {
  userId: string;
  taskId: string;
  type: NotificationTypeName;
  title?: string;
  message?: string;
}

interface PushPayload {
  title: string;
  body: string;
  data?: {
    taskId: string;
    type: NotificationTypeName;
    url: string;
  };
}

export async function createNotification({
  userId,
  taskId,
  type,
  title,
  message,
}: CreateNotificationParams): Promise<void> {
  const id = uuidv4();

  await db.insert(notifications).values({
    id,
    user_id: userId,
    task_id: taskId,
    type,
    title: title || getDefaultTitle(type),
    message: message || getDefaultMessage(type),
    is_read: false,
  });

  // ✅ Send push notification
  try {
    await sendPushNotificationToUser(userId, {
      title: title || getDefaultTitle(type),
      body: message || getDefaultMessage(type),
      data: {
        taskId,
        type,
        url: `/tasks/${taskId}`,
      },
    });
  } catch (error) {
    console.error("Failed to send push notification:", error);
  }
}

async function sendPushNotificationToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.user_id, userId));

  for (const sub of subscriptions) {
    try {
      await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
      );
    } catch (error) {
      console.error(`Failed to send push to subscription ${sub.id}:`, error);
    }
  }
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
    TASK_COMPLETED: "A task you're following has been completed.",
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

export interface NotificationWithTask {
  id: string;
  user_id: string;
  task_id: string;
  type: NotificationTypeName;
  title: string;
  message: string;
  is_read: boolean;
  created_at: Date;
  taskTitle: string | null;
  taskStatus: string | null;
  taskPriority: string | null;
}

// Fix for Drizzle ORM join error, don't alias notification fields as a subobject, just select plain notification fields + left join task fields.
export async function getUserNotifications(
  userId: string,
  options: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  } = {},
): Promise<{
  notifications: NotificationWithTask[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const { page = 1, limit = 20, unreadOnly = false } = options;
  const offset = (page - 1) * limit;

  const conditions = [eq(notifications.user_id, userId)];
  if (unreadOnly) {
    conditions.push(eq(notifications.is_read, false));
  }

  const whereClause = and(...conditions);

  // Get total count
  const totalCountResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(whereClause);

  const totalCount = totalCountResult[0]?.count ?? 0;

  // Instead of mapping sub-objects, select notification fields flat and join task fields by alias
  const notificationListRaw = await db
    .select({
      id: notifications.id,
      user_id: notifications.user_id,
      task_id: notifications.task_id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      is_read: notifications.is_read,
      created_at: notifications.created_at,
      taskTitle: tasks.title,
      taskStatus: tasks.status,
      taskPriority: tasks.priority,
    })
    .from(notifications)
    .leftJoin(tasks, eq(notifications.task_id, tasks.id))
    .where(whereClause)
    .orderBy(desc(notifications.created_at))
    .limit(limit)
    .offset(offset);

  // Force default title/message if null
  const notificationList: NotificationWithTask[] = notificationListRaw.map(
    (row) => ({
      id: row.id,
      user_id: row.user_id,
      task_id: row.task_id,
      type: row.type as NotificationTypeName,
      title: row.title ?? getDefaultTitle(row.type as NotificationTypeName),
      message:
        row.message ?? getDefaultMessage(row.type as NotificationTypeName),
      is_read: row.is_read,
      created_at: row.created_at,
      taskTitle: row.taskTitle ?? null,
      taskStatus: (row.taskStatus ?? null) as string | null,
      taskPriority: (row.taskPriority ?? null) as string | null,
    }),
  );

  return {
    notifications: notificationList,
    total: totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
  };
}

export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ is_read: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.user_id, userId),
      ),
    );
}

export async function markAllNotificationsAsRead(
  userId: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ is_read: true })
    .where(eq(notifications.user_id, userId));
}

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.user_id, userId), eq(notifications.is_read, false)),
    );

  return result[0]?.count ?? 0;
}
