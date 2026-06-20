"use client";

import { useEffect } from "react";
import { pusherClient } from "@/lib/pusher-client";

interface Options {
  onTaskUpdate?: () => void;
  onCommentUpdate?: () => void;
}

export function useTaskRealtime(taskId: string | null, options: Options = {}) {
  const { onTaskUpdate, onCommentUpdate } = options;

  useEffect(() => {
    // Guard: only run on client + if pusher is available
    if (typeof window === "undefined" || !taskId || !pusherClient) return;

    // At this point TypeScript still sees pusherClient as Pusher | null
    // so we capture it in a local const that is narrowed to Pusher
    const client = pusherClient;

    const channelName = `task-${taskId}`;
    const channel = client.subscribe(channelName);

    channel.bind("task_updated", () => {
      onTaskUpdate?.();
    });

    channel.bind("comment_updated", () => {
      onCommentUpdate?.();
    });

    return () => {
      client.unsubscribe(channelName); // ✅ client is Pusher, never null
    };
  }, [taskId, onTaskUpdate, onCommentUpdate]);
}
