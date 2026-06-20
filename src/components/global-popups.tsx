// app/(dashboard)/_components/global-popups.tsx
//
// NO POLLING. Event-driven via SSE + visibility/online/focus listeners.
//
// How break popup gets shown:
//   1. SSE BREAK_NOW    → immediate popup (break happening right now)
//   2. SSE BREAK_SCHEDULE setTimeout → popup at scheduled time
//   3. SSE BREAK_MISSED → user returned after break window, break auto-inserted
//   4. Reconnects on visibility/online/focus → catches missed breaks
//   5. break:autostarted window event from BreakButton

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AttendanceReminderPopup } from "@/app/(dashboard)/attendance/_components/attendance-reminder-popup";
import { BreakReminderPopup } from "@/app/(dashboard)/attendance/_components/break-reminder-popup";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

interface BreakWindow {
  start: string;
  end: string;
}

const RETRY_DELAYS_MS = [30_000, 60_000, 120_000];

// ── PKT-aware schedule reconnect helper ──────────────────────────────────────
// breakEndStr is a PKT time like "14:30"
// We need to reconnect 2 min after that time IN PKT
function msUntilPKTTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();

  // Build PKT midnight in UTC
  const pktMirror = new Date(now.getTime() + PKT_OFFSET_MS);
  const pktYear = pktMirror.getUTCFullYear();
  const pktMonth = pktMirror.getUTCMonth();
  const pktDay = pktMirror.getUTCDate();
  const pktMidnightUTC =
    Date.UTC(pktYear, pktMonth, pktDay, 0, 0, 0, 0) - PKT_OFFSET_MS;

  const targetUTC = new Date(pktMidnightUTC + (h * 60 + m) * 60 * 1000);
  return Math.max(0, targetUTC.getTime() - now.getTime());
}

export function GlobalPopups() {
  const [breakTrigger, setBreakTrigger] = useState<BreakWindow | null>(null);

  const breakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const connectSSERef = useRef<() => void>(() => {});
  const triggerBreakRef = useRef<
    (start: string, end: string, retryIdx?: number) => Promise<void>
  >(() => Promise.resolve());

  // In-memory dedup keyed by break ID
  const shownBreakIdsRef = useRef<Set<string>>(new Set());
  const pendingRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Trigger break popup with smart retry ──────────────────────────────────
  const triggerBreak = useCallback(
    async (start: string, end: string, retryIdx = 0) => {
      if (pendingRetryRef.current) {
        clearTimeout(pendingRetryRef.current);
        pendingRetryRef.current = null;
      }

      try {
        const res = await fetch("/api/attendance/break", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "ON_BREAK" && data.break?.id) {
          if (shownBreakIdsRef.current.has(data.break.id)) return;
          shownBreakIdsRef.current.add(data.break.id);
          setBreakTrigger({ start, end });
          return;
        }

        if (data.isAfterBreak === true) return;

        if (data.status === "NOT_CHECKED_IN") {
          pendingRetryRef.current = setTimeout(
            () => void triggerBreakRef.current(start, end, retryIdx),
            2 * 60 * 1000,
          );
          return;
        }

        if (data.status === "CHECKED_IN") {
          if (retryIdx >= RETRY_DELAYS_MS.length) return;
          const delay = RETRY_DELAYS_MS[retryIdx];
          pendingRetryRef.current = setTimeout(
            () => void triggerBreakRef.current(start, end, retryIdx + 1),
            delay,
          );
          return;
        }
      } catch {
        if (retryIdx < RETRY_DELAYS_MS.length) {
          const delay = RETRY_DELAYS_MS[retryIdx];
          pendingRetryRef.current = setTimeout(
            () => void triggerBreakRef.current(start, end, retryIdx + 1),
            delay,
          );
        }
      }
    },
    [],
  );

  useEffect(() => {
    triggerBreakRef.current = triggerBreak;
  }, [triggerBreak]);

  // ── Schedule reconnect after break ends (PKT-aware) ───────────────────────
  const scheduleReconnect = useCallback((breakEndStr: string) => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    // 2 minutes after break end time in PKT
    const msUntilEnd = msUntilPKTTime(breakEndStr);
    const delay = msUntilEnd + 2 * 60 * 1000;

    reconnectTimerRef.current = setTimeout(() => {
      connectSSERef.current();
    }, delay);
  }, []);

  // ── Connect to SSE ────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    if (breakTimerRef.current) {
      clearTimeout(breakTimerRef.current);
      breakTimerRef.current = null;
    }

    const source = new EventSource("/api/attendance/stream");
    sourceRef.current = source;

    source.onmessage = (e: MessageEvent) => {
      source.close();
      sourceRef.current = null;

      let data: {
        type: string;
        start?: string;
        end?: string;
        msUntilBreak?: number;
        isTomorrow?: boolean;
        message?: string;
      };

      try {
        data = JSON.parse(e.data as string);
      } catch {
        return;
      }

      if (data.type === "TRACKING_OFF") return;

      // Break happening right now — trigger immediately
      if (data.type === "BREAK_NOW" && data.start && data.end) {
        void triggerBreakRef.current(data.start, data.end);
        scheduleReconnect(data.end);
        return;
      }

      // ── NEW: User returned after break window already closed ──────────────
      // Server already inserted the break session — just show the popup
      if (data.type === "BREAK_MISSED" && data.start && data.end) {
        // Use a synthetic key since there's no live break ID
        const missedKey = `missed-${data.start}-${new Date().toDateString()}`;
        if (shownBreakIdsRef.current.has(missedKey)) {
          // Already shown for today — schedule tomorrow
          const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
          const tomorrowHint = tomorrow.toISOString();
          void tomorrowHint; // just schedule reconnect
          scheduleReconnect(data.end);
          return;
        }
        shownBreakIdsRef.current.add(missedKey);
        setBreakTrigger({ start: data.start, end: data.end });
        scheduleReconnect(data.end);
        return;
      }

      // Break scheduled for later today or tomorrow
      if (
        data.type === "BREAK_SCHEDULE" &&
        data.msUntilBreak != null &&
        data.start &&
        data.end
      ) {
        const { start, end, msUntilBreak } = data;
        if (msUntilBreak > 48 * 60 * 60 * 1000) return;

        breakTimerRef.current = setTimeout(() => {
          void triggerBreakRef.current(start, end);
          scheduleReconnect(end);
        }, msUntilBreak);
      }
    };

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      // Fast 10s recovery
      reconnectTimerRef.current = setTimeout(
        () => connectSSERef.current(),
        10_000,
      );
    };
  }, [scheduleReconnect]);

  useEffect(() => {
    connectSSERef.current = connectSSE;
  }, [connectSSE]);

  // ── Initial connection + reconnect listeners ──────────────────────────────
  useEffect(() => {
    connectSSE();

    // Tab comes back to foreground — catches mobile suspension
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        connectSSERef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Network restored
    const handleOnline = () => {
      connectSSERef.current();
    };
    window.addEventListener("online", handleOnline);

    // Some mobile browsers fire focus but not visibilitychange
    const handleFocus = () => {
      connectSSERef.current();
    };
    window.addEventListener("focus", handleFocus);

    // Break:autostarted event from BreakButton (attendance page)
    const handleBreakEvent = (e: Event) => {
      const detail = (e as CustomEvent<BreakWindow>).detail;
      if (detail?.start && detail?.end) {
        void triggerBreakRef.current(detail.start, detail.end);
      }
    };
    window.addEventListener("break:autostarted", handleBreakEvent);

    return () => {
      if (sourceRef.current) sourceRef.current.close();
      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pendingRetryRef.current) clearTimeout(pendingRetryRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("break:autostarted", handleBreakEvent);
    };
  }, [connectSSE]);

  return (
    <>
      <AttendanceReminderPopup onAction={() => {}} />
      <BreakReminderPopup
        trigger={breakTrigger}
        onTriggerConsumed={() => setBreakTrigger(null)}
        onAction={() => {}}
      />
    </>
  );
}
