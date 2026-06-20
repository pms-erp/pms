"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { pusherClient } from "@/lib/pusher-client";

interface UnreadCountContextValue {
  unreadCount: number;
  setUnreadCount: (count: number | ((prev: number) => number)) => void;
  refreshCount: () => Promise<void>;
}

const UnreadCountContext = createContext<UnreadCountContextValue>({
  unreadCount: 0,
  setUnreadCount: () => {},
  refreshCount: async () => {},
});

export function useUnreadCount() {
  return useContext(UnreadCountContext);
}

// Minimum time between background re-fetches triggered by focus/visibility.
// 500ms → every tab switch fires instantly → hundreds of calls/hour
// 5min  → at most 1 call per 5 minutes per user from background events
//
// Pusher realtime events still trigger instant updates — this only
// throttles the fallback polling on focus/visibilitychange.
const MIN_FOCUS_REFETCH_MS = 5 * 60 * 1000; // 5 minutes

export function UnreadCountProvider({
  children,
  initialCount = 0,
}: {
  children: React.ReactNode;
  initialCount?: number;
}) {
  const { data: session } = useSession();
  const [unreadCount, setUnreadCount] = useState(initialCount);

  const fetchingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // ── KEY FIX: track when we last fetched from focus/visibility ──────────────
  // Without this, every tab switch fires a fetch immediately (500ms debounce
  // is not enough). With 5-minute tracking, switching tabs 20 times in a row
  // only triggers 1 actual API call.
  const lastFocusFetchRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Core fetch ────────────────────────────────────────────────────────────
  const fetchCount = useCallback(async () => {
    if (!session || fetchingRef.current || !mountedRef.current) return;

    fetchingRef.current = true;
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok || !mountedRef.current) return;
      const data = (await res.json()) as { count: number };
      if (mountedRef.current) setUnreadCount(data.count);
    } catch {
      // silent
    } finally {
      fetchingRef.current = false;
    }
  }, [session]);

  // ── Focus/visibility fetch — rate-limited to once per 5 minutes ──────────
  // This is the main fix. Previously used a 500ms debounce which meant
  // every single page navigation / tab switch hit the API.
  const focusFetch = useCallback(() => {
    const now = Date.now();
    if (now - lastFocusFetchRef.current < MIN_FOCUS_REFETCH_MS) return;
    lastFocusFetchRef.current = now;

    // Small debounce to collapse rapid successive events (e.g. focus fires
    // twice quickly on some browsers)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchCount(), 500);
  }, [fetchCount]);

  // ── Initial fetch on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (session) {
      // Record the initial fetch time so focus events right after mount
      // don't immediately fire another fetch
      lastFocusFetchRef.current = Date.now();
      void fetchCount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── Pusher realtime (instant — not throttled) ─────────────────────────────
  // Real-time updates via Pusher are NOT throttled. If a notification
  // arrives, the count updates immediately.
  useEffect(() => {
    if (!session || !pusherClient) return;

    const client = pusherClient;
    const channelName = `user-${session.user.id}`;
    const channel = client.subscribe(channelName);

    channel.bind(
      "notification",
      (data: { refresh?: boolean; unreadDelta?: number }) => {
        if (!mountedRef.current) return;

        if (data?.refresh) {
          // Pusher triggered refresh — bypass rate limit (it's realtime, not polling)
          void fetchCount();
          return;
        }

        if (typeof data?.unreadDelta === "number") {
          setUnreadCount((prev) => Math.max(0, prev + data.unreadDelta!));
        }
      },
    );

    return () => {
      client.unsubscribe(channelName);
    };
  }, [session, fetchCount]);

  // ── Tab focus / visibility — rate-limited ─────────────────────────────────
  useEffect(() => {
    if (!session) return;

    const onFocus = () => focusFetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") focusFetch();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [session, focusFetch]);

  return (
    <UnreadCountContext.Provider
      value={{ unreadCount, setUnreadCount, refreshCount: fetchCount }}
    >
      {children}
    </UnreadCountContext.Provider>
  );
}
