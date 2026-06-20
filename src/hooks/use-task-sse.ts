// src/hooks/use-task-sse.ts
//
// SINGLETON CONNECTION MANAGER
// ─────────────────────────────
// Both task-detail.tsx and task-comments.tsx call useTaskSSE(taskId).
// Without deduplication this opens TWO SSE connections to the same endpoint,
// doubling traffic and causing double reconnects every 55s.
//
// This module maintains ONE EventSource per taskId in a module-level Map.
// Multiple callers share the same connection — each adds its callbacks to a Set.
// The connection closes only when ALL callers have unmounted (refCount → 0).
//
// Reconnect strategy:
//   "rotate" event  → server planned close before Vercel timeout → silent reconnect
//   onerror         → real network failure → one refetch, then exponential backoff

"use client";

import { useEffect, useRef } from "react";

// ─── Module-level singleton store ─────────────────────────────────────────────

type Listeners = {
  onTaskUpdate: Set<() => void>;
  onCommentUpdate: Set<() => void>;
};

type Connection = {
  es: EventSource | null;
  listeners: Listeners;
  refCount: number;
  rotating: boolean; // true while rotate-triggered reconnect is pending
  retryDelay: number;
  retryTimeout: ReturnType<typeof setTimeout> | null;
};

const pool = new Map<string, Connection>();

// ─── Internal connect function ─────────────────────────────────────────────────

function openConnection(taskId: string): void {
  const conn = pool.get(taskId);
  if (!conn) return;

  conn.es?.close();
  conn.es = null;
  conn.rotating = false;

  const es = new EventSource(`/api/tasks/${taskId}/events`);
  conn.es = es;

  es.onmessage = (e: MessageEvent<string>) => {
    const current = pool.get(taskId);
    if (!current) return;

    try {
      const data = JSON.parse(e.data) as { type: string };

      if (data.type === "rotate") {
        // ── Planned server close before Vercel timeout ────────────────────
        // Nothing changed — reconnect silently without calling any callbacks.
        current.rotating = true;
        current.retryDelay = 1000; // reset — this is not a failure
        es.close();
        current.es = null;
        current.retryTimeout = setTimeout(() => {
          if (pool.has(taskId)) openConnection(taskId);
        }, 500); // short wait — server closes 200ms after rotate
        return;
      }

      if (data.type === "task_updated") {
        current.listeners.onTaskUpdate.forEach((fn) => fn());
      }
      if (data.type === "comment_updated") {
        current.listeners.onCommentUpdate.forEach((fn) => fn());
      }
      // "connected" silently ignored
    } catch {
      /* ignore malformed */
    }
  };

  es.onopen = () => {
    const current = pool.get(taskId);
    if (current) current.retryDelay = 1000; // reset backoff on clean connect
  };

  es.onerror = () => {
    const current = pool.get(taskId);
    if (!current) return;

    // Ignore errors that follow a rotate — we already scheduled reconnect
    if (current.rotating) {
      current.rotating = false;
      return;
    }

    es.close();
    current.es = null;

    // Real network failure — notify all listeners so UIs can refetch
    current.listeners.onTaskUpdate.forEach((fn) => fn());

    // Exponential backoff: 1s → 2s → 4s → max 30s
    current.retryTimeout = setTimeout(() => {
      current.retryDelay = Math.min(current.retryDelay * 2, 30_000);
      if (pool.has(taskId)) openConnection(taskId);
    }, current.retryDelay);
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface TaskSSEOptions {
  onTaskUpdate?: () => void;
  onCommentUpdate?: () => void;
  /** Set false to skip SSE (e.g. task is APPROVED and won't change) */
  enabled?: boolean;
}

export function useTaskSSE(
  taskId: string | null | undefined,
  { onTaskUpdate, onCommentUpdate, enabled = true }: TaskSSEOptions = {},
) {
  // Stable refs so callbacks can change without triggering reconnect
  const onTaskUpdateRef = useRef(onTaskUpdate);
  const onCommentUpdateRef = useRef(onCommentUpdate);
  useEffect(() => {
    onTaskUpdateRef.current = onTaskUpdate;
  });
  useEffect(() => {
    onCommentUpdateRef.current = onCommentUpdate;
  });

  useEffect(() => {
    if (!taskId || !enabled) return;

    // ── Stable wrapper functions that call current ref ─────────────────────
    // Using refs means the callback Set never needs to be rebuilt when
    // the parent component re-renders with a new function reference.
    const taskCb = () => onTaskUpdateRef.current?.();
    const commentCb = () => onCommentUpdateRef.current?.();

    // ── Get or create the shared connection for this taskId ────────────────
    if (!pool.has(taskId)) {
      pool.set(taskId, {
        es: null,
        listeners: { onTaskUpdate: new Set(), onCommentUpdate: new Set() },
        refCount: 0,
        rotating: false,
        retryDelay: 1000,
        retryTimeout: null,
      });
      openConnection(taskId);
    }

    const conn = pool.get(taskId)!;
    conn.refCount++;
    conn.listeners.onTaskUpdate.add(taskCb);
    conn.listeners.onCommentUpdate.add(commentCb);

    return () => {
      const current = pool.get(taskId);
      if (!current) return;

      current.listeners.onTaskUpdate.delete(taskCb);
      current.listeners.onCommentUpdate.delete(commentCb);
      current.refCount--;

      // Close + remove the connection only when ALL callers have unmounted
      if (current.refCount <= 0) {
        if (current.retryTimeout) clearTimeout(current.retryTimeout);
        current.es?.close();
        pool.delete(taskId);
      }
    };
  }, [taskId, enabled]); // callbacks intentionally excluded — using refs
}
