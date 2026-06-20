"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useUnreadCount } from "./notification-count-context";
import { notificationEvents } from "@/lib/events";

/**
 * Handles ONLY in-app toast display and optimistic unread count updates
 * when a push message arrives via the service worker.
 *
 * Push subscription setup lives entirely in PushListenerProvider.
 * Do NOT add SW registration or subscribe calls here.
 */
export function NotificationProvider() {
  const { data: session } = useSession();
  const router = useRouter();
  const { setUnreadCount } = useUnreadCount();
  const listenerAttachedRef = useRef(false);

  useEffect(() => {
    if (!session || listenerAttachedRef.current) return;
    if (!("serviceWorker" in navigator)) return;

    listenerAttachedRef.current = true;

    const swMessageHandler = (event: MessageEvent) => {
      if (event.data?.type !== "NOTIFICATION_RECEIVED") return;

      const { title, body, data } = event.data.payload;

      toast(title, {
        description: body,
        duration: 5000,
        ...(data?.url && {
          action: {
            label: "View",
            onClick: () => router.push(data.url),
          },
        }),
      });

      // Optimistic increment — no round-trip needed
      setUnreadCount((prev) => prev + 1);

      // Refresh notification list if the page is open
      notificationEvents.triggerNotificationReceived();

      if (data?.type === "TASK_ASSIGNED") {
        window.dispatchEvent(new CustomEvent("taskAssigned"));
      }
    };

    navigator.serviceWorker.addEventListener("message", swMessageHandler);

    return () => {
      navigator.serviceWorker.removeEventListener("message", swMessageHandler);
      listenerAttachedRef.current = false;
    };
  }, [session, router, setUnreadCount]);

  return null;
}
