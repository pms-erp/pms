"use client";

import { useEffect, useRef, useState } from "react";
import { IconClock, IconAlertTriangle } from "@tabler/icons-react";

interface TaskTimerProps {
  startedAt: string | Date | null | undefined;
  estimatedMinutes: number | null | undefined;
  taskId: string;
  assignedUserId: string;
  currentUserId: string;
  onTimeExceeded?: () => void;
  stopped?: boolean; // ← ADD THIS
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDuration(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = totalSeconds < 0 ? "-" : "";
  if (h > 0) return `${sign}${h}h ${pad(m)}m ${pad(s)}s`;
  return `${sign}${pad(m)}m ${pad(s)}s`;
}

export function TaskTimer({
  startedAt,
  estimatedMinutes,
  taskId,
  assignedUserId,
  currentUserId,
  onTimeExceeded,
  stopped = false,
}: TaskTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Store the callback in a ref so it never causes re-runs of effects
  const onTimeExceededRef = useRef(onTimeExceeded);
  useEffect(() => {
    onTimeExceededRef.current = onTimeExceeded;
  }, [onTimeExceeded]);

  // Single ref that tracks whether we've fired the callback this session
  // Keyed to taskId so navigating to a different task resets it
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    if (stopped) return;

    const start = new Date(startedAt).getTime();

    const tick = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - start) / 1000);
      setElapsedSeconds(elapsed);

      // Fire onTimeExceeded exactly once per taskId per page load
      if (estimatedMinutes) {
        const estimatedSeconds = estimatedMinutes * 60;
        if (elapsed >= estimatedSeconds && firedRef.current !== taskId) {
          firedRef.current = taskId;
          // Call via ref so we always use the latest version of the callback
          onTimeExceededRef.current?.();
        }
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // Only re-run if startedAt, estimatedMinutes, or taskId changes
    // NOT when onTimeExceeded changes — that's handled via ref
  }, [startedAt, estimatedMinutes, taskId, stopped]);

  if (!startedAt) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <IconClock className="h-4 w-4" />
        <span>Timer not started</span>
      </div>
    );
  }

  const estimatedSeconds = estimatedMinutes ? estimatedMinutes * 60 : null;
  const progress = estimatedSeconds
    ? Math.min((elapsedSeconds / estimatedSeconds) * 100, 100)
    : null;
  const remainingSeconds = estimatedSeconds
    ? estimatedSeconds - elapsedSeconds
    : null;
  const isOvertime = remainingSeconds !== null && remainingSeconds <= 0;
  const isWarning =
    remainingSeconds !== null &&
    remainingSeconds > 0 &&
    estimatedSeconds !== null &&
    remainingSeconds / estimatedSeconds <= 0.2;

  const barColor = isOvertime
    ? "bg-red-500"
    : isWarning
      ? "bg-yellow-400"
      : "bg-blue-500";

  const textColor = isOvertime
    ? "text-red-600"
    : isWarning
      ? "text-yellow-600"
      : "text-foreground";

  const bgColor = isOvertime
    ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800"
    : isWarning
      ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800"
      : "bg-muted/40 border-border";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isOvertime || isWarning ? (
            <IconAlertTriangle
              className={`h-4 w-4 ${isOvertime ? "text-red-500" : "text-yellow-500"}`}
            />
          ) : (
            <IconClock className="h-4 w-4 text-blue-500" />
          )}
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {isOvertime
              ? "Overtime"
              : isWarning
                ? "Time Running Low"
                : "Elapsed"}
          </span>
        </div>
        <span className={`text-sm font-mono font-bold ${textColor}`}>
          {isOvertime
            ? `+${formatDuration(elapsedSeconds - (estimatedSeconds ?? 0))}`
            : formatDuration(elapsedSeconds)}
        </span>
      </div>

      {estimatedSeconds && (
        <>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${barColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isOvertime ? (
                <span className="text-red-500 font-medium">Time exceeded</span>
              ) : (
                <span
                  className={isWarning ? "text-yellow-600 font-medium" : ""}
                >
                  {formatDuration(remainingSeconds!)} remaining
                </span>
              )}
            </span>
            <span>Est. {formatDuration(estimatedSeconds)}</span>
          </div>
        </>
      )}
    </div>
  );
}
