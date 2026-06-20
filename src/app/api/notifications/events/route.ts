// app/api/notifications/events/route.ts

// ─── Vercel config — REQUIRED ─────────────────────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type Controller = ReadableStreamDefaultController<Uint8Array>;
const connections = new Map<string, Set<Controller>>();

const HEARTBEAT_MS = 25_000;
const STREAM_TTL_MS = 55_000;

// ─── Broadcast helper ─────────────────────────────────────────────────────────

export function broadcastNotification(
  userId: string,
  payload: { unreadDelta?: number; refresh?: boolean } = { unreadDelta: 1 },
): void {
  const listeners = connections.get(userId);
  if (!listeners?.size) return;

  const msg = `data: ${JSON.stringify({ type: "notification", ...payload })}\n\n`;
  const bytes = new TextEncoder().encode(msg);

  for (const ctrl of [...listeners]) {
    try {
      ctrl.enqueue(bytes);
    } catch {
      listeners.delete(ctrl);
    }
  }
  if (!listeners.size) connections.delete(userId);
}

// ─── GET — open SSE stream ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  let controller: Controller | null = null;
  let cleanedUp = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let rotateTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (heartbeat) clearInterval(heartbeat);
    if (rotateTimer) clearTimeout(rotateTimer);
    if (controller) connections.get(userId)?.delete(controller);
    if (!connections.get(userId)?.size) connections.delete(userId);
  };

  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
      if (!connections.has(userId)) connections.set(userId, new Set());
      connections.get(userId)!.add(ctrl);

      ctrl.enqueue(
        enc.encode(
          `retry: 1000\ndata: ${JSON.stringify({ type: "connected" })}\n\n`,
        ),
      );

      // ── Send 'rotate' event BEFORE Vercel kills the function ─────────────
      // Client receives 'rotate' → reconnects silently WITHOUT fetching unread count
      // This prevents the unnecessary /api/notifications/unread-count call every 55s
      rotateTimer = setTimeout(() => {
        if (!controller || cleanedUp) return;
        try {
          ctrl.enqueue(
            enc.encode(`data: ${JSON.stringify({ type: "rotate" })}\n\n`),
          );
          setTimeout(() => {
            try {
              ctrl.close();
            } catch {
              /* no-op */
            } finally {
              cleanup();
            }
          }, 200);
        } catch {
          cleanup();
        }
      }, STREAM_TTL_MS);
    },
    cancel() {
      cleanup();
    },
  });

  heartbeat = setInterval(() => {
    if (!controller || cleanedUp) {
      cleanup();
      return;
    }
    const listeners = connections.get(userId);
    if (!listeners?.has(controller)) {
      cleanup();
      return;
    }
    try {
      controller.enqueue(enc.encode(`: ping\n\n`));
    } catch {
      cleanup();
    }
  }, HEARTBEAT_MS);

  req.signal.addEventListener("abort", cleanup);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
