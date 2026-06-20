// app/api/attendance/today/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const todayDate = new Date();

    // First check for open session (no check_out)
    const openRecord = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.user_id, userId), isNull(attendance.check_out)))
      .then((r) => r[0] ?? null);

    if (openRecord) {
      return NextResponse.json({
        status: "CHECKED_IN",
        record: {
          ...openRecord,
          check_in:
            openRecord.check_in instanceof Date
              ? openRecord.check_in.toISOString()
              : openRecord.check_in,
          check_out: null,
          date:
            openRecord.date instanceof Date
              ? openRecord.date.toISOString().split("T")[0]
              : openRecord.date,
        },
      });
    }

    // Check for completed record today
    const completedRecord = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.user_id, userId),
          sql`DATE(${attendance.check_in}) = CURDATE()`,
          isNotNull(attendance.check_out),
        ),
      )
      .then((r) => r[0] ?? null);

    if (completedRecord) {
      return NextResponse.json({
        status: "CHECKED_OUT",
        record: {
          ...completedRecord,
          check_in:
            completedRecord.check_in instanceof Date
              ? completedRecord.check_in.toISOString()
              : completedRecord.check_in,
          check_out:
            completedRecord.check_out instanceof Date
              ? completedRecord.check_out.toISOString()
              : completedRecord.check_out,
          date:
            completedRecord.date instanceof Date
              ? completedRecord.date.toISOString().split("T")[0]
              : completedRecord.date,
        },
      });
    }

    return NextResponse.json({ status: "NOT_CHECKED_IN", record: null });
  } catch (err) {
    console.error("GET /api/attendance/today:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
