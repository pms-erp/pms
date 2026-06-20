// components/providers/push-listener-provider.tsx
"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const SESSION_KEY = "push_subscribed_endpoint";

export function PushListenerProvider() {
  const { data: session } = useSession();
  const subscribingRef = useRef(false);

  useEffect(() => {
    if (!session) return;
    if (subscribingRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    subscribingRef.current = true;

    const setup = async () => {
      try {
        // ── 1. Get VAPID public key ──────────────────────────────────────────
        const keyRes = await fetch("/api/notifications/subscribe");
        if (!keyRes.ok) return;
        const { publicKey } = (await keyRes.json()) as { publicKey?: string };
        if (!publicKey) return;

        // ── 2. Register service worker ───────────────────────────────────────
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await navigator.serviceWorker.ready;

        // ── 3. Get or create push subscription ──────────────────────────────
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            // ✅ Fix: use new Uint8Array() constructor (gives ArrayBuffer-backed
            //    Uint8Array) instead of Uint8Array.from() which gives
            //    Uint8Array<ArrayBufferLike> — incompatible with BufferSource
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        const endpoint = sub.endpoint;

        // ── 4. Skip server call if same endpoint already sent this session ───
        const cachedEndpoint = sessionStorage.getItem(SESSION_KEY);
        if (cachedEndpoint === endpoint) {
          // Same endpoint → already registered, no DB hit needed
          return;
        }

        // ── 5. Send to server only on first visit or endpoint rotation ───────
        const res = await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        });

        if (res.ok) {
          sessionStorage.setItem(SESSION_KEY, endpoint);
        }
      } catch (err) {
        console.warn("Push setup:", err);
      } finally {
        subscribingRef.current = false;
      }
    };

    void setup();
  }, [session]);

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts a URL-safe base64 VAPID key string to a Uint8Array<ArrayBuffer>.
 *
 * Using `new Uint8Array(length)` + index assignment instead of
 * `Uint8Array.from()` because the former produces `Uint8Array<ArrayBuffer>`
 * which satisfies the `BufferSource` type expected by PushSubscriptionOptions.
 * `Uint8Array.from()` produces `Uint8Array<ArrayBufferLike>` which TypeScript
 * rejects since ArrayBufferLike is not assignable to ArrayBuffer.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length); // ← ArrayBuffer-backed ✅
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}
