// lib/pusher-client.ts
"use client";

import Pusher from "pusher-js";

export const pusherClient =
  typeof window !== "undefined"
    ? new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        forceTLS: true,
        enabledTransports: ["ws", "wss"], // ✅ Force WebSocket for browser
      })
    : null;

export type PusherClient = typeof pusherClient;
