"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  IconBell,
  IconBellRinging,
  IconCheck,
  IconTrash,
  IconClock,
  IconAlertCircle,
  IconCircle,
  IconRefresh,
  IconMaskOff,
} from "@tabler/icons-react";
import Link from "next/link";
import { notificationEvents } from "@/lib/events";
import { useUnreadCount } from "@/components/providers/notification-count-context";

interface Notification {
  id: string;
  user_id: string;
  task_id: string;
  type: string;
  title: string | null;
  message: string | null;
  is_read: boolean;
  created_at: Date | string;
  taskTitle: string | null;
  taskStatus: string | null;
  taskPriority: string | null;
}

interface NotificationsClientProps {
  initialData: {
    notifications: Notification[];
    total: number;
    page: number;
    totalPages: number;
  };
}

export function NotificationsClient({ initialData }: NotificationsClientProps) {
  const [notifications, setNotifications] = useState<Notification[]>(
    initialData.notifications,
  );
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const activeTabRef = useRef(activeTab);

  // ── Unread count lives in context — shared with the bell badge ────────────
  // No separate polling here; the context handles the 60s interval.
  const { unreadCount, setUnreadCount } = useUnreadCount();

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // ── Fetch the notification list (not the count) ───────────────────────────
  // Uses AbortController so navigating away doesn't leave orphaned requests.
  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(
        `/api/notifications?unreadOnly=${activeTabRef.current === "unread"}`,
        { signal },
      );
      if (!res.ok || res.status === 0) return; // aborted or error
      const data = await res.json();
      setNotifications(data.notifications);
    } catch (error: unknown) {
      // Ignore AbortError — it's intentional
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error fetching notifications:", error);
      }
    }
  }, []);

  // ── Fetch once on mount, then only on explicit triggers ───────────────────
  // No polling loop here — count polling belongs to UnreadCountContext.
  useEffect(() => {
    const controller = new AbortController();
    fetchNotifications(controller.signal);
    return () => controller.abort();
  }, [fetchNotifications]);

  // ── Re-fetch list when tab changes ────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetchNotifications(controller.signal);
    return () => controller.abort();
  }, [activeTab, fetchNotifications]);

  // ── Listen for same-page real-time events ─────────────────────────────────
  // Only refresh the LIST here; count is already updated optimistically in
  // NotificationProvider via setUnreadCount.
  useEffect(() => {
    const cleanup = notificationEvents.onNotificationReceived(() => {
      fetchNotifications();
    });
    return () => cleanup();
  }, [fetchNotifications]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const markAsRead = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      toast.success("Notification marked as read");
    } catch {
      toast.error("Failed to mark notification as read");
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all notifications as read");
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/notifications/${notificationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      const deleted = notifications.find((n) => n.id === notificationId);
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (deleted && !deleted.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      toast.success("Notification deleted");
    } catch {
      toast.error("Failed to delete notification");
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "TASK_ASSIGNED":
        return <IconMaskOff className="h-5 w-5 text-blue-500" />;
      case "TASK_COMPLETED":
        return <IconCircle className="h-5 w-5 text-green-500" />;
      case "TASK_APPROVED":
        return <IconCircle className="h-5 w-5 text-green-500" />;
      case "TASK_REWORK":
        return <IconRefresh className="h-5 w-5 text-orange-500" />;
      case "TIME_EXCEEDED":
        return <IconClock className="h-5 w-5 text-red-500" />;
      case "HELP_REQUEST":
        return <IconAlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <IconBell className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  const displayed =
    activeTab === "unread"
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            Stay updated with your task activities
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>
            <IconCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v === "unread" ? "unread" : "all")}
      >
        <TabsList>
          <TabsTrigger value="all" className="relative">
            All
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 px-2">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === "all"
                  ? "All Notifications"
                  : "Unread Notifications"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displayed.length === 0 ? (
                <div className="text-center py-12">
                  <IconBellRinging className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">
                    No notifications yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayed.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                        notification.is_read
                          ? "bg-background"
                          : "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                      }`}
                    >
                      <div className="shrink-0 mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-sm">
                              {notification.title}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                            {notification.taskTitle && (
                              <Link
                                href={`/tasks/${notification.task_id}`}
                                className="text-xs text-primary hover:underline mt-2 inline-block"
                              >
                                Task: {notification.taskTitle}
                              </Link>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {formatDate(notification.created_at)}
                            </span>
                            {!notification.is_read && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => markAsRead(notification.id)}
                              >
                                <IconCheck className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() =>
                                deleteNotification(notification.id)
                              }
                            >
                              <IconTrash className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
