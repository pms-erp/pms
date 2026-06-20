// app/(dashboard)/attendance/_components/attendance-reminder-popup.tsx
//
// Shows a check-in or check-out reminder popup when:
//   • User opens the app within the configured window around office start/end
//   • User comes back to the tab (visibilitychange)
//   • User switches back to the browser window (focus event)
//
// PERFORMANCE FIX:
//   Debounce changed from 30s → 5 minutes.
//   Office config cached in module scope (never changes during the day).
//   This reduces API calls from ~120/hour to ~12/hour per user.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  IconLogin,
  IconLogout,
  IconLoader,
  IconMapPin,
} from "@tabler/icons-react";

// ── Office config cached at module level ──────────────────────────────────────
// The office config never changes during a working day.
// Fetching it once per session (not per check) saves ~half the API calls.
interface OfficeConfig {
  office_start: string;
  office_end: string;
  checkin_window_minutes: number;
  checkout_window_minutes: number;
}

let cachedConfig: OfficeConfig | null = null;

async function getOfficeConfig(): Promise<OfficeConfig | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const res = await fetch("/api/attendance/office-config");
    const data = await res.json();
    cachedConfig = data.config as OfficeConfig;
    return cachedConfig;
  } catch {
    return null;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

type PopupKind = "CHECK_IN" | "CHECK_OUT";

// Minimum milliseconds between consecutive status checks.
// 30s → users switching tabs 2x/min × 40 users = 4,800 calls/hour
// 5min → users switching tabs 2x/min × 40 users = 480 calls/hour (90% reduction)
const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function parseHHMM(hhmm: string, base: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function getCoords(): Promise<{ latitude: number; longitude: number }> {
  function attempt(high: boolean) {
    return new Promise<{ latitude: number; longitude: number }>(
      (resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }),
          (err) => {
            if (err.code === 1)
              reject(
                new Error(
                  "Location permission denied. Please allow location and try again.",
                ),
              );
            else if (err.code === 3) reject(new Error("__TIMEOUT__"));
            else reject(new Error("Could not get location."));
          },
          {
            enableHighAccuracy: high,
            timeout: high ? 10000 : 20000,
            maximumAge: high ? 0 : 60000,
          },
        );
      },
    );
  }
  return attempt(true).catch((e: Error) => {
    if (e.message === "__TIMEOUT__") return attempt(false);
    throw e;
  });
}

interface Props {
  onAction?: () => void;
}

export function AttendanceReminderPopup({ onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PopupKind>("CHECK_IN");
  const [acting, setActing] = useState(false);
  const [locating, setLocating] = useState(false);

  // Track which kind we already showed this session
  const shownRef = useRef<Set<PopupKind>>(new Set());
  // Timestamp of the last status check — prevents hammering on rapid focus/nav
  const lastCheckRef = useRef<number>(0);

  const check = useCallback(async () => {
    const now = Date.now();

    // ── KEY FIX: 5-minute debounce (was 30s) ─────────────────────────────
    // Prevents firing on every tab switch / page navigation.
    // A user switching tabs 10x in 5 minutes still only triggers 1 API call.
    if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    lastCheckRef.current = now;

    try {
      // Office config is cached — only fetched ONCE per session, not per check
      const [todayRes, cfg] = await Promise.all([
        fetch("/api/attendance/today"),
        getOfficeConfig(),
      ]);

      if (!cfg) return;

      const todayData = await todayRes.json();
      const nowDate = new Date();

      const officeStart = parseHHMM(cfg.office_start, nowDate);
      const officeEnd = parseHHMM(cfg.office_end, nowDate);
      const windowMs = (m: number) => m * 60 * 1000;

      const checkinStart = new Date(
        officeStart.getTime() - windowMs(cfg.checkin_window_minutes),
      );
      const checkinEnd = new Date(
        officeStart.getTime() + windowMs(cfg.checkin_window_minutes),
      );
      const checkoutStart = new Date(
        officeEnd.getTime() - windowMs(cfg.checkout_window_minutes),
      );
      const checkoutEnd = new Date(
        officeEnd.getTime() + windowMs(cfg.checkout_window_minutes),
      );

      const inCheckinWindow = nowDate >= checkinStart && nowDate <= checkinEnd;
      const inCheckoutWindow =
        nowDate >= checkoutStart && nowDate <= checkoutEnd;

      if (inCheckinWindow && todayData.status === "NOT_CHECKED_IN") {
        if (shownRef.current.has("CHECK_IN")) return;
        shownRef.current.add("CHECK_IN");
        setKind("CHECK_IN");
        setOpen(true);
      } else if (inCheckoutWindow && todayData.status === "CHECKED_IN") {
        if (shownRef.current.has("CHECK_OUT")) return;
        shownRef.current.add("CHECK_OUT");
        setKind("CHECK_OUT");
        setOpen(true);
      }
    } catch {
      // silently ignore — don't block the user
    }
  }, []);

  useEffect(() => {
    // Initial check — slight delay so page fully loads first
    const t = setTimeout(() => void check(), 1500);

    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => void check();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  async function handleConfirm() {
    setActing(true);
    setLocating(true);
    let coords: { latitude: number; longitude: number };

    try {
      coords = await getCoords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Location failed");
      setActing(false);
      setLocating(false);
      return;
    }
    setLocating(false);

    const endpoint =
      kind === "CHECK_IN"
        ? "/api/attendance/check-in"
        : "/api/attendance/check-out";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed");
        return;
      }

      toast.success(
        kind === "CHECK_IN"
          ? data.location
            ? `Checked in at ${data.location}!`
            : "Checked in successfully!"
          : data.location
            ? `Checked out from ${data.location}! Total: ${data.total_hours}h`
            : `Checked out! Total: ${data.total_hours}h`,
      );

      if (data.autoClosedPrevious) {
        toast.info("Yesterday's forgotten check-out was automatically closed.");
      }

      setOpen(false);
      onAction?.();
    } catch {
      toast.error("Action failed");
    } finally {
      setActing(false);
    }
  }

  function handleDismiss() {
    setOpen(false);
    // Remove from shownRef so if user dismisses and comes back,
    // the popup can show again on their next visit
    shownRef.current.delete(kind);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleDismiss();
      }}
    >
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <div
            className={`h-12 w-12 rounded-full flex items-center justify-center mb-2 ${
              kind === "CHECK_IN" ? "bg-green-100" : "bg-amber-100"
            }`}
          >
            {kind === "CHECK_IN" ? (
              <IconLogin className="h-6 w-6 text-green-600" />
            ) : (
              <IconLogout className="h-6 w-6 text-amber-600" />
            )}
          </div>
          <DialogTitle className="text-lg">
            {kind === "CHECK_IN"
              ? "Don't forget to check in!"
              : "Time to check out!"}
          </DialogTitle>
          <DialogDescription>
            {kind === "CHECK_IN"
              ? "It looks like you haven't checked in yet today. Would you like to check in now?"
              : "The office is about to close. Would you like to check out now?"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <IconMapPin className="h-3.5 w-3.5 shrink-0" />
          <span>Your location will be verified.</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDismiss} disabled={acting}>
            Dismiss
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={acting}
            className={`gap-2 ${
              kind === "CHECK_IN"
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-amber-600 hover:bg-amber-700 text-white"
            }`}
          >
            {acting ? (
              locating ? (
                <>
                  <IconMapPin className="h-4 w-4 animate-bounce" /> Getting
                  location…
                </>
              ) : (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" />{" "}
                  {kind === "CHECK_IN" ? "Checking in…" : "Checking out…"}
                </>
              )
            ) : (
              <>
                {kind === "CHECK_IN" ? (
                  <IconLogin className="h-4 w-4" />
                ) : (
                  <IconLogout className="h-4 w-4" />
                )}
                {kind === "CHECK_IN" ? "Check In Now" : "Check Out Now"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
