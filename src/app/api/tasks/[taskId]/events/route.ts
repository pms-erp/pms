// app/api/tasks/[taskId]/events/route.ts

// ─── Vercel config — REQUIRED for SSE to work ─────────────────────────────────
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type Controller = ReadableStreamDefaultController<Uint8Array>;
const connections = new Map<string, Set<Controller>>();

const HEARTBEAT_MS = 25_000; // ping every 25s to keep proxy alive
const STREAM_TTL_MS = 55_000; // close 5s before Vercel 60s limit

// ─── Broadcast helpers ────────────────────────────────────────────────────────

export function broadcastTaskUpdate(
  taskId: string,
  data: Record<string, unknown> = {},
): void {
  const listeners = connections.get(taskId);
  if (!listeners?.size) return;

  const msg = `data: ${JSON.stringify({ type: "task_updated", taskId, ...data })}\n\n`;
  const bytes = new TextEncoder().encode(msg);

  for (const ctrl of [...listeners]) {
    try {
      ctrl.enqueue(bytes);
    } catch {
      listeners.delete(ctrl);
    }
  }
  if (!listeners.size) connections.delete(taskId);
}

export function broadcastCommentUpdate(taskId: string): void {
  const listeners = connections.get(taskId);
  if (!listeners?.size) return;

  const msg = `data: ${JSON.stringify({ type: "comment_updated", taskId })}\n\n`;
  const bytes = new TextEncoder().encode(msg);

  for (const ctrl of [...listeners]) {
    try {
      ctrl.enqueue(bytes);
    } catch {
      listeners.delete(ctrl);
    }
  }
}

// ─── GET — open SSE stream ────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { taskId } = await params;
  let controller: Controller | null = null;
  let cleanedUp = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let rotateTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (heartbeat) clearInterval(heartbeat);
    if (rotateTimer) clearTimeout(rotateTimer);
    if (controller) connections.get(taskId)?.delete(controller);
    if (!connections.get(taskId)?.size) connections.delete(taskId);
  };

  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
      if (!connections.has(taskId)) connections.set(taskId, new Set());
      connections.get(taskId)!.add(ctrl);

      // retry:1000 tells browser to reconnect after 1s if connection drops
      ctrl.enqueue(
        enc.encode(
          `retry: 1000\ndata: ${JSON.stringify({ type: "connected", taskId })}\n\n`,
        ),
      );

      // ── Send 'rotate' event BEFORE Vercel kills the function ─────────────
      // Client receives 'rotate' → reconnects silently WITHOUT refetching data
      // This prevents the unnecessary /api/tasks/[taskId] call every 55s
      rotateTimer = setTimeout(() => {
        if (!controller || cleanedUp) return;
        try {
          // Signal client: clean planned reconnect — no data changed
          ctrl.enqueue(
            enc.encode(`data: ${JSON.stringify({ type: "rotate" })}\n\n`),
          );
          // Small delay so client receives the event before we close
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

  // ── Heartbeat — keeps proxy/load balancer from dropping idle connection ───
  heartbeat = setInterval(() => {
    if (!controller || cleanedUp) {
      cleanup();
      return;
    }
    const listeners = connections.get(taskId);
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
