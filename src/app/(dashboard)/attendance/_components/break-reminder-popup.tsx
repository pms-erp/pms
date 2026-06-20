// app/(dashboard)/attendance/_components/break-reminder-popup.tsx
//
// NO CRON. NO POLLING. NO INTERVALS. NO API CALLS.
//
// Two ways this popup can open:
//   1. PRIMARY: `trigger` prop from parent (GlobalPopups in layout).
//      SSE setTimeout fires → triggerBreak() → setBreakTrigger in parent
//      → this component receives trigger prop and shows dialog.
//
//   2. FALLBACK: Service worker message { type: "BREAK_STARTED" }
//      If push notifications are configured, SW posts a message here.
"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconCoffee, IconCalendar, IconClock } from "@tabler/icons-react";

interface Props {
  onAction?: () => void;
  trigger?: { start: string; end: string } | null;
  onTriggerConsumed?: () => void;
}

export function BreakReminderPopup({
  onAction,
  trigger,
  onTriggerConsumed,
}: Props) {
  const [open, setOpen] = useState(false);
  const [breakWindow, setBreakWindow] = useState<{
    start: string;
    end: string;
  } | null>(null);

  // Keep latest callbacks in refs — avoids stale closures without
  // adding them to effect dependency arrays
  const onTriggerConsumedRef = useRef(onTriggerConsumed);
  const triggerRef = useRef(trigger);
  useEffect(() => {
    onTriggerConsumedRef.current = onTriggerConsumed;
  }, [onTriggerConsumed]);
  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);

  // ── PRIMARY: respond to trigger prop ──────────────────────────────────────
  // ALL setState calls are deferred via setTimeout(0) so they happen
  // outside the current render cycle — fixes "setState synchronously
  // within an effect can trigger cascading renders" lint error.
  useEffect(() => {
    if (!trigger) return;

    const t = setTimeout(() => {
      setBreakWindow(triggerRef.current ?? null);
      setOpen(true);
      onTriggerConsumedRef.current?.(); // clear trigger in parent
    }, 0);

    return () => clearTimeout(t);
  }, [trigger]); // only trigger needed — callbacks handled via refs

  // ── FALLBACK: service worker push notification ────────────────────────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "BREAK_STARTED") return;
      // Also defer SW-triggered state updates for consistency
      setTimeout(() => {
        setBreakWindow(
          event.data.start && event.data.end
            ? { start: event.data.start, end: event.data.end }
            : null,
        );
        setOpen(true);
      }, 0);
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", handler);
  }, []);

  function handleDismiss() {
    setOpen(false);
    onAction?.();
  }

  const isFriday = new Date().getDay() === 5;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-2">
            <IconCoffee className="h-6 w-6 text-amber-600" />
          </div>
          <DialogTitle className="text-lg">Break Time!</DialogTitle>
          <DialogDescription>
            Your scheduled break has automatically started. Press{" "}
            <strong>End Break</strong> when you return.
          </DialogDescription>
        </DialogHeader>

        {breakWindow && (
          <div className="space-y-2 py-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconClock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Break window:{" "}
                <strong>
                  {breakWindow.start} – {breakWindow.end}
                </strong>
              </span>
            </div>
            {isFriday && (
              <div className="flex items-center gap-2 text-xs text-green-600">
                <IconCalendar className="h-3.5 w-3.5 shrink-0" />
                <span>Friday — extended break applies (Jumu&apos;ah)</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={handleDismiss}
            className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <IconCoffee className="h-4 w-4" />
            Got it — Enjoy your break!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
