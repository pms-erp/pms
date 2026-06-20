// app/(dashboard)/attendance/_components/check-in-card.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconLogin,
  IconLogout,
  IconClock,
  IconLoader,
  IconCheck,
  IconMapPin,
  IconAlertCircle,
} from "@tabler/icons-react";

type TodayStatus = "NOT_CHECKED_IN" | "CHECKED_IN" | "CHECKED_OUT" | "LOADING";

interface AttendanceRecord {
  id: string;
  check_in: string;
  check_out: string | null;
  total_hours: string | null;
  status: string;
}

interface Props {
  onCheckedIn: () => void;
  onCheckedOut: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-700 border-green-200",
  HALF_DAY: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ABSENT: "bg-red-100 text-red-700 border-red-200",
};

function formatTime(date: string | Date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Gets user's current GPS coordinates with fallback retry logic.
 * First attempts high-accuracy (GPS), then falls back to network-based location.
 */
export function getCoords(): Promise<{ latitude: number; longitude: number }> {
  function attempt(
    highAccuracy: boolean,
  ): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        (err) => {
          console.error(
            "Geolocation error — code:",
            err.code,
            "message:",
            err.message,
          );
          switch (err.code) {
            case 1: // PERMISSION_DENIED
              reject(
                new Error(
                  "Location permission denied. Please allow location access in your browser settings and try again.",
                ),
              );
              break;
            case 2: // POSITION_UNAVAILABLE
              reject(
                new Error(
                  "Location unavailable. Please ensure GPS/location services are enabled on your device.",
                ),
              );
              break;
            case 3: // TIMEOUT
              reject(new Error("__TIMEOUT__"));
              break;
            default:
              reject(
                new Error(
                  `Location error (code ${err.code}): ${err.message || "Unknown error"}. Please ensure location services are enabled.`,
                ),
              );
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 10000 : 20000,
          maximumAge: highAccuracy ? 0 : 60000,
        },
      );
    });
  }

  return attempt(true).catch((err: Error) => {
    if (err.message === "__TIMEOUT__") {
      // Retry with network-based location (WiFi/cell) — faster indoors
      return attempt(false).catch(() => {
        throw new Error(
          "Location timed out. Please move closer to a window, enable WiFi, or check your device's location settings and try again.",
        );
      });
    }
    throw err;
  });
}

export function CheckInCard({ onCheckedIn, onCheckedOut }: Props) {
  const [status, setStatus] = useState<TodayStatus>("LOADING");
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [acting, setActing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchToday = useCallback(async () => {
    setGeoError(null);
    try {
      const res = await fetch("/api/attendance/today");
      const data = (await res.json()) as {
        status: string;
        record: AttendanceRecord | null;
      };
      setStatus(data.status as TodayStatus);
      setRecord(data.record);
      if (data.status === "CHECKED_IN" && data.record) {
        const secs = Math.floor(
          (Date.now() - new Date(data.record.check_in).getTime()) / 1000,
        );
        setElapsed(Math.max(0, secs));
      }
    } catch (err) {
      console.error("Failed to fetch today's attendance:", err);
      setStatus("NOT_CHECKED_IN");
      setGeoError("Unable to load attendance status. Please refresh the page.");
    }
  }, []);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  // Live timer for elapsed work time
  useEffect(() => {
    if (status === "CHECKED_IN") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  async function handleCheckIn() {
    setActing(true);
    setLocating(true);
    setGeoError(null);

    try {
      // Step 1: Get GPS coordinates
      let coords: { latitude: number; longitude: number };
      try {
        coords = await getCoords();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get location";
        setGeoError(errorMessage);
        toast.error(errorMessage);
        return;
      } finally {
        setLocating(false);
      }

      // Step 2: Send to API for validation and check-in
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setGeoError("You are not at an allowed location to check in.");
        }
        toast.error(data.error ?? "Failed to check in");
        return;
      }

      if (data.location) setLocationName(data.location);
      toast.success(
        data.location
          ? `✓ Checked in at ${data.location}!`
          : "✓ Checked in successfully!",
      );
      setElapsed(0);
      await fetchToday();
      onCheckedIn();
    } catch (err) {
      console.error("Check-in error:", err);
      toast.error("Failed to check in. Please try again.");
    } finally {
      setActing(false);
      setLocating(false);
    }
  }

  async function handleCheckOut() {
    setActing(true);
    setLocating(true);
    setGeoError(null);

    try {
      // Step 1: Get GPS coordinates
      let coords: { latitude: number; longitude: number };
      try {
        coords = await getCoords();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to get location";
        setGeoError(errorMessage);
        toast.error(errorMessage);
        return;
      } finally {
        setLocating(false);
      }

      // Step 2: Send to API for validation and check-out
      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coords),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setGeoError("You are not at an allowed location to check out.");
        }
        toast.error(data.error ?? "Failed to check out");
        return;
      }

      toast.success(
        data.location
          ? `✓ Checked out from ${data.location}! Total: ${data.total_hours}h`
          : `✓ Checked out! Total: ${data.total_hours}h`,
      );
      setLocationName(null);
      await fetchToday();
      onCheckedOut();
    } catch (err) {
      console.error("Check-out error:", err);
      toast.error("Failed to check out. Please try again.");
    } finally {
      setActing(false);
      setLocating(false);
    }
  }

  const isCheckedIn = status === "CHECKED_IN";
  const isCheckedOut = status === "CHECKED_OUT";
  const isLoading = status === "LOADING";

  // Dynamic button label based on current state
  const buttonLabel = () => {
    if (!acting) return isCheckedIn ? "Check Out" : "Check In";
    if (locating) return "Getting location…";
    return isCheckedIn ? "Checking out…" : "Checking in…";
  };

  return (
    <Card className="border-border/60 overflow-hidden shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Left: Info Section */}
          <div className="flex-1 p-6 space-y-4">
            {/* Date Header */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">
                Today
              </p>
              <p className="text-lg font-semibold">{formatDate()}</p>
            </div>

            {/* Live Timer (when checked in) */}
            {isCheckedIn && (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                  <IconClock className="h-6 w-6 text-green-600 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Working</p>
                  <p className="text-2xl font-bold font-mono text-green-600">
                    {formatDuration(elapsed)}
                  </p>
                </div>
              </div>
            )}

            {/* Completed Summary (when checked out) */}
            {isCheckedOut && record && (
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <IconCheck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Total worked today
                  </p>
                  <p className="text-2xl font-bold font-mono text-blue-600">
                    {parseFloat(record.total_hours ?? "0").toFixed(1)}h
                  </p>
                </div>
              </div>
            )}

            {/* Record Details */}
            {record && (
              <div className="flex gap-6 text-sm flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Check In</p>
                  <p className="font-medium">{formatTime(record.check_in)}</p>
                </div>
                {record.check_out && (
                  <div>
                    <p className="text-xs text-muted-foreground">Check Out</p>
                    <p className="font-medium">
                      {formatTime(record.check_out)}
                    </p>
                  </div>
                )}
                {record.status && (
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge
                      variant="outline"
                      className={`text-xs mt-0.5 ${STATUS_BADGE[record.status] ?? ""}`}
                    >
                      {record.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                )}
                {locationName && (
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <IconMapPin className="h-3 w-3 text-muted-foreground" />
                      <p className="text-xs font-medium">{locationName}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Not Checked In State */}
            {status === "NOT_CHECKED_IN" && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t checked in yet today.
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  <IconMapPin className="h-3 w-3" />
                  <span>Location verification required</span>
                </div>
                {geoError && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{geoError}</span>
                  </div>
                )}
              </div>
            )}

            {/* Location Error Display (when applicable) */}
            {geoError && !isCheckedOut && status !== "NOT_CHECKED_IN" && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{geoError}</span>
              </div>
            )}
          </div>

          {/* Right: Action Button Section */}
          <div
            className={`flex items-center justify-center p-8 sm:w-56 shrink-0 transition-colors
              ${
                isCheckedIn
                  ? "bg-red-500/5"
                  : isCheckedOut
                    ? "bg-blue-500/5"
                    : isLoading
                      ? "bg-muted/30"
                      : "bg-green-500/5"
              }`}
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <IconLoader className="h-8 w-8 animate-spin" />
                <p className="text-sm">Loading status…</p>
              </div>
            ) : isCheckedOut ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="h-20 w-20 rounded-full bg-blue-500/10 border-4 border-blue-200 flex items-center justify-center">
                  <IconCheck className="h-10 w-10 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-blue-700">
                  Done for today!
                </p>
                <p className="text-xs text-muted-foreground">
                  See you tomorrow
                </p>
              </div>
            ) : (
              <Button
                size="lg"
                onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
                disabled={acting}
                className={`h-20 w-44 text-sm font-semibold rounded-2xl gap-2 flex-col transition-all
                  ${
                    isCheckedIn
                      ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200"
                      : "bg-green-600 hover:bg-green-700 text-white shadow-green-200"
                  } shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                {acting ? (
                  locating ? (
                    <>
                      <IconMapPin className="h-6 w-6 animate-bounce" />
                      <span className="text-center leading-tight">
                        Getting location…
                      </span>
                    </>
                  ) : (
                    <>
                      <IconLoader className="h-6 w-6 animate-spin" />
                      <span className="text-center leading-tight">
                        {isCheckedIn ? "Checking out…" : "Checking in…"}
                      </span>
                    </>
                  )
                ) : isCheckedIn ? (
                  <>
                    <IconLogout className="h-6 w-6" />
                    <span className="text-center leading-tight">Check Out</span>
                  </>
                ) : (
                  <>
                    <IconLogin className="h-6 w-6" />
                    <span className="text-center leading-tight">Check In</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
