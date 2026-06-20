// app/api/attendance/stream/route.ts
//
// ⚠️  File must be at: app/api/attendance/stream/route.ts
//
// Standard Node.js runtime (NOT Edge):
//   - getServerSession requires Node.js
//   - MySQL db connection requires Node.js
//   - Connection closes after ONE message so 10s Vercel timeout is never hit.
//
// Sends exactly ONE SSE message then closes:
//   BREAK_NOW      → break window is happening right now (in PKT)
//   BREAK_SCHEDULE → ms until break starts (later today or tomorrow, PKT)
//   BREAK_MISSED   → break window already closed BUT user was checked in
//                    and has no break session → auto-insert a full break for them
//   TRACKING_OFF   → break tracking disabled

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, breakSessions } from "@/db/schema";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getOfficeConfig, getAllowedBreakMinutes } from "@/lib/office-config";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

// ── PKT Helpers ───────────────────────────────────────────────────────────────

function toPKTMirror(utcDate: Date): Date {
  return new Date(utcDate.getTime() + PKT_OFFSET_MS);
}

function parseAsPKT(hhmm: string, utcRef: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const pktMirror = toPKTMirror(utcRef);
  const pktYear = pktMirror.getUTCFullYear();
  const pktMonth = pktMirror.getUTCMonth();
  const pktDay = pktMirror.getUTCDate();
  const pktMidnightUTC =
    Date.UTC(pktYear, pktMonth, pktDay, 0, 0, 0, 0) - PKT_OFFSET_MS;
  return new Date(pktMidnightUTC + (h * 60 + m) * 60 * 1000);
}

function getBreakWindowForDay(
  config: {
    break_start_time: string;
    break_end_time: string;
    break_start_time_friday?: string | null;
    break_end_time_friday?: string | null;
  },
  utcDate: Date,
): { start: string; end: string } {
  const pktMirror = toPKTMirror(utcDate);
  const isFriday = pktMirror.getUTCDay() === 5;
  return {
    start:
      isFriday && config.break_start_time_friday
        ? config.break_start_time_friday
        : config.break_start_time,
    end:
      isFriday && config.break_end_time_friday
        ? config.break_end_time_friday
        : config.break_end_time,
  };
}

// ── SSE response helper ───────────────────────────────────────────────────────

function sseResponse(payload: Record<string, unknown>): NextResponse {
  return new NextResponse(`data: ${JSON.stringify(payload)}\n\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const config = await getOfficeConfig();

    if (!config.break_tracking_enabled) {
      return sseResponse({ type: "TRACKING_OFF" });
    }

    const now = new Date();
    const window = getBreakWindowForDay(config, now);
    const breakStart = parseAsPKT(window.start, now);
    const breakEnd = parseAsPKT(window.end, now);

    // ── Case 1: Break is happening RIGHT NOW ──────────────────────────────
    if (now >= breakStart && now <= breakEnd) {
      return sseResponse({
        type: "BREAK_NOW",
        start: window.start,
        end: window.end,
      });
    }

    // ── Case 2: Break is later today ──────────────────────────────────────
    if (now < breakStart) {
      const msUntilBreak = breakStart.getTime() - now.getTime();
      return sseResponse({
        type: "BREAK_SCHEDULE",
        msUntilBreak,
        start: window.start,
        end: window.end,
      });
    }

    // ── Case 3: Today's break already finished ────────────────────────────
    // Check if this user was checked in during break but has NO break session
    // This covers: user tab was suspended during break window, came back after
    const userId = session.user.id;

    const openAttendance = await db
      .select({ id: attendance.id, check_in: attendance.check_in })
      .from(attendance)
      .where(and(eq(attendance.user_id, userId), isNull(attendance.check_out)))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (openAttendance) {
      const checkInTime =
        openAttendance.check_in instanceof Date
          ? openAttendance.check_in
          : new Date(openAttendance.check_in as string);

      // Was checked in before break window closed?
      const wasCheckedInDuringBreak = checkInTime <= breakEnd;

      if (wasCheckedInDuringBreak) {
        // Does user already have a break session today?
        const existingBreak = await db
          .select({ id: breakSessions.id })
          .from(breakSessions)
          .where(eq(breakSessions.attendance_id, openAttendance.id))
          .limit(1)
          .then((r) => r[0] ?? null);

        if (!existingBreak) {
          // User missed break — auto-insert a completed break session
          // using the full allowed break window
          const allowed = getAllowedBreakMinutes(config, now);
          const breakId = uuid();

          await db.insert(breakSessions).values({
            id: breakId,
            attendance_id: openAttendance.id,
            user_id: userId,
            break_start: breakStart,
            break_end: breakEnd,
            actual_minutes: String(allowed),
            allowed_minutes: allowed,
            overtime_minutes: "0", // no overtime — they didn't actually take extra
          });

          // Tell client to show the "you had a break" popup
          return sseResponse({
            type: "BREAK_MISSED",
            start: window.start,
            end: window.end,
            message: "Your break was auto-recorded",
          });
        }
      }
    }

    // ── Schedule for tomorrow ─────────────────────────────────────────────
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowWindow = getBreakWindowForDay(config, tomorrow);
    const tomorrowStart = parseAsPKT(tomorrowWindow.start, tomorrow);
    const msUntilBreak = tomorrowStart.getTime() - now.getTime();

    return sseResponse({
      type: "BREAK_SCHEDULE",
      msUntilBreak,
      start: tomorrowWindow.start,
      end: tomorrowWindow.end,
      isTomorrow: true,
    });
  } catch (err) {
    console.error("GET /api/attendance/stream:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
