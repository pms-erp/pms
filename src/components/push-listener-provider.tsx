"use client";

import { useEffect } from "react";
import { notificationEvents } from "@/lib/events";

const SUBSCRIBED_KEY = "push_subscribed_v1";

/**
 * Mounts once in the dashboard layout.
 * Does TWO things:
 * 1. Registers SW + subscribes user to push (requests permission if needed).
 *    Uses localStorage to skip the VAPID fetch + subscribe POST on subsequent
 *    page loads — the subscription is stable until the browser clears it.
 * 2. Bridges SW postMessage → notificationEvents for in-app list refresh.
 *    (Toast display and count increment live in NotificationProvider.)
 */
export function PushListenerProvider() {
  // ── Step 1: Register SW + subscribe to push ────────────────────────────
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    )
      return;

    async function registerAndSubscribe() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        await navigator.serviceWorker.ready;

        // Don't prompt if already denied
        if (Notification.permission === "denied") {
          console.warn("[Push] Permission denied — cannot subscribe");
          return;
        }

        // Request permission if not yet granted
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") return;
        }

        // Check for stale FCM subscription (shut down June 2024)
        const existingSub = await registration.pushManager.getSubscription();
        const isStale = existingSub?.endpoint.includes(
          "fcm.googleapis.com/fcm/send",
        );

        if (isStale) {
          console.warn("[Push] Stale FCM endpoint — re-subscribing...");
          await existingSub!.unsubscribe();
          localStorage.removeItem(SUBSCRIBED_KEY);
        }

        // ── Guard: skip the VAPID fetch + POST if already registered ──────
        // The subscription object is stable in the browser until explicitly
        // unsubscribed or the browser clears push state. Re-POSTing on every
        // page load was generating hundreds of unnecessary /subscribe calls.
        if (existingSub && !isStale && localStorage.getItem(SUBSCRIBED_KEY)) {
          return;
        }

        // If browser has a subscription but our flag is missing (e.g. first
        // load after deploy), re-save it to DB once then set the flag.
        if (existingSub && !isStale) {
          await saveSubscription(existingSub);
          localStorage.setItem(SUBSCRIBED_KEY, "1");
          return;
        }

        // No subscription at all — fetch VAPID key and subscribe
        const keyRes = await fetch("/api/notifications/subscribe");
        if (!keyRes.ok) {
          console.error("[Push] Failed to fetch VAPID key:", keyRes.status);
          return;
        }
        const { publicKey } = (await keyRes.json()) as { publicKey: string };
        if (!publicKey) {
          console.error("[Push] VAPID public key missing");
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            publicKey,
          ) as unknown as string,
        });

        await saveSubscription(subscription);

        // Mark as subscribed so future page loads skip straight through
        localStorage.setItem(SUBSCRIBED_KEY, "1");
        console.log("[Push] ✅ Subscribed and saved");
      } catch (err) {
        console.error("[Push] ❌ Registration error:", err);
      }
    }

    registerAndSubscribe();
  }, []);

  // ── Step 2: Bridge SW postMessage → notificationEvents ────────────────
  // NotificationProvider handles the toast + count increment.
  // This fires the event that refreshes the notification list UI.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_RECEIVED") {
        notificationEvents.triggerNotificationReceived();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
