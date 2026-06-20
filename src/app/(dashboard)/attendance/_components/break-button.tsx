"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconCoffee,
  IconLoader,
  IconAlertTriangle,
  IconClock,
  IconInfoCircle,
  IconPower,
} from "@tabler/icons-react";

interface BreakStats {
  totalBreakMinutes: number;
  totalOvertimeMinutes: number;
  breakCount: number;
}

interface BreakConfig {
  break_start_time: string;
  break_end_time: string;
  break_start_time_friday?: string;
  break_end_time_friday?: string;
  break_tracking_enabled: boolean;
}

interface Props {
  refreshKey: number;
}

const ACTING_LOCK_KEY = "break_end_acting";

function readActingLock(): boolean {
  try {
    return localStorage.getItem(ACTING_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function writeActingLock(val: boolean): void {
  try {
    if (val) {
      localStorage.setItem(ACTING_LOCK_KEY, "1");
    } else {
      localStorage.removeItem(ACTING_LOCK_KEY);
    }
  } catch {
    // localStorage unavailable — no-op
  }
}

function fmtMin(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(min * 60)}s`;
}

function formatTime(timeStr?: string) {
  if (!timeStr) return "";
  return timeStr.length > 5 ? timeStr.slice(0, 5) : timeStr;
}

export function BreakButton({ refreshKey }: Props) {
  const [status, setStatus] = useState<
    | "LOADING"
    | "NOT_CHECKED_IN"
    | "ON_BREAK"
    | "CHECKED_IN"
    | "TRACKING_DISABLED"
    | "ERROR"
  >("LOADING");

  // Pure ref — guards against double-clicks in async handlers.
  // Never read during render; button disabled state comes from `ending` state below.
  const actingRef = useRef<boolean>(readActingLock());

  // Separate single-purpose state just for the "Ending…" button spinner.
  // Set only in event handlers (lock/unlock), never inside effects.
  const [ending, setEnding] = useState<boolean>(false);

  const [elapsed, setElapsed] = useState(0);
  const [allowedMinutes, setAllowedMinutes] = useState(30);
  const [stats, setStats] = useState<BreakStats | null>(null);
  const [config, setConfig] = useState<BreakConfig | null>(null);
  const [isBreakTime, setIsBreakTime] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartFiredRef = useRef(false);

  const isFriday = new Date().getDay() === 5;
  const todayBreakStart =
    isFriday && config?.break_start_time_friday
      ? config.break_start_time_friday
      : config?.break_start_time;
  const todayBreakEnd =
    isFriday && config?.break_end_time_friday
      ? config.break_end_time_friday
      : config?.break_end_time;

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/attendance/break");

      if (!res.ok) {
        console.error("Break API error:", res.status, await res.text());
        setStatus("ERROR");
        return;
      }

      const data = await res.json();

      if (!data.config?.break_tracking_enabled) {
        setStatus("TRACKING_DISABLED");
        return;
      }

      const newStatus =
        data.status === "NOT_CHECKED_IN"
          ? "NOT_CHECKED_IN"
          : data.status === "ON_BREAK"
            ? "ON_BREAK"
            : "CHECKED_IN";

      setStatus(newStatus);
      setIsBreakTime(data.isBreakTime ?? false);
      if (data.config) setConfig(data.config);

      if (data.status === "ON_BREAK" && data.break) {
        setAllowedMinutes(data.break.allowed_minutes);
        const secs = Math.floor(
          (Date.now() - new Date(data.break.break_start).getTime()) / 1000,
        );
        setElapsed(Math.max(0, secs));
      }

      if (data.todayStats) setStats(data.todayStats);

      if (data.status !== "ON_BREAK") {
        // Release the ref lock — no setState here, ref only
        actingRef.current = false;
        writeActingLock(false);
        autoStartFiredRef.current = false;
      }

      if (data.wasAutoStarted && !autoStartFiredRef.current && data.config) {
        autoStartFiredRef.current = true;
        const isFridayFetch = new Date().getDay() === 5;
        const start =
          isFridayFetch && data.config.break_start_time_friday
            ? data.config.break_start_time_friday
            : data.config.break_start_time;
        const end =
          isFridayFetch && data.config.break_end_time_friday
            ? data.config.break_end_time_friday
            : data.config.break_end_time;

        window.dispatchEvent(
          new CustomEvent("break:autostarted", { detail: { start, end } }),
        );
      }
    } catch (err) {
      console.error("Break status fetch failed:", err);
      setStatus("ERROR");
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus, refreshKey]);

  useEffect(() => {
    if (status === "ON_BREAK") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchStatus]);

  // Click handler — setState here is fine, this is an event handler not an effect
  async function handleEndBreak() {
    if (actingRef.current) return;

    actingRef.current = true;
    writeActingLock(true);
    setEnding(true); // ← setState in event handler: always allowed

    try {
      const res = await fetch("/api/attendance/break", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed");
        actingRef.current = false;
        writeActingLock(false);
        setEnding(false);
        return;
      }

      if (data.overtime_minutes > 0) {
        toast.warning(
          `Break ended — ${data.overtime_minutes.toFixed(1)}m over limit will be deducted`,
        );
      } else {
        toast.success("Break ended — back to work!");
      }

      // fetchStatus will set actingRef.current = false (ref only, no setState).
      // status will change to CHECKED_IN which hides the button — ending resets below.
      await fetchStatus();
    } catch (err) {
      console.error("End break error:", err);
      toast.error("Something went wrong. Please try again.");
      actingRef.current = false;
      writeActingLock(false);
    } finally {
      // Always reset the spinner state — safe here, finally runs in the handler
      setEnding(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (status === "ERROR") {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <IconAlertTriangle className="h-3.5 w-3.5" />
        <span>Could not load break status.</span>
        <button
          className="underline underline-offset-2"
          onClick={() => {
            setStatus("LOADING");
            void fetchStatus();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === "TRACKING_DISABLED") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <IconPower className="h-3.5 w-3.5 opacity-50" />
        <span className="opacity-50">Break tracking disabled</span>
      </div>
    );
  }

  if (status === "NOT_CHECKED_IN") return null;

  if (status === "LOADING") {
    return (
      <div className="h-9 w-36 flex items-center justify-center">
        <IconLoader className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const elapsedMinutes = elapsed / 60;
  const isOver = status === "ON_BREAK" && elapsedMinutes > allowedMinutes;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Break window hint */}
      {isBreakTime && status === "CHECKED_IN" && config && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
          <IconInfoCircle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Break window: {formatTime(todayBreakStart)} –{" "}
            {formatTime(todayBreakEnd)}
            <span className="text-green-600 font-medium ml-1">
              Auto-started
            </span>
          </span>
        </div>
      )}

      {/* Today's break stats */}
      {stats && stats.breakCount > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <IconCoffee className="h-3.5 w-3.5" />
          <span>{fmtMin(stats.totalBreakMinutes)} taken today</span>
          {stats.totalOvertimeMinutes > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] bg-red-50 text-red-600 border-red-200 gap-0.5"
            >
              <IconAlertTriangle className="h-2.5 w-2.5" />
              {fmtMin(stats.totalOvertimeMinutes)} over
            </Badge>
          )}
        </div>
      )}

      {/* ON BREAK — timer + End Break */}
      {status === "ON_BREAK" && (
        <>
          <div
            className={`flex items-center gap-1.5 text-sm font-mono font-semibold ${isOver ? "text-red-600" : "text-amber-600"}`}
          >
            <IconClock className="h-4 w-4" />
            {fmtMin(elapsedMinutes)}
            <span className="text-xs font-normal text-muted-foreground">
              / {allowedMinutes}m allowed
            </span>
            {isOver && (
              <Badge
                variant="outline"
                className="text-[10px] bg-red-50 text-red-600 border-red-200 ml-1"
              >
                OVER LIMIT
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleEndBreak}
            disabled={ending}
            className="gap-1.5"
          >
            {ending ? (
              <>
                <IconLoader className="h-4 w-4 animate-spin" />
                Ending…
              </>
            ) : (
              <>
                <IconCoffee className="h-4 w-4" />
                End Break
              </>
            )}
          </Button>
        </>
      )}

      {/* CHECKED IN not on break — upcoming break hint */}
      {status === "CHECKED_IN" &&
        !isBreakTime &&
        config?.break_tracking_enabled && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5">
            <IconCoffee className="h-3.5 w-3.5 opacity-50" />
            <span>Break auto-starts at {formatTime(todayBreakStart)}</span>
          </div>
        )}
    </div>
  );
}
