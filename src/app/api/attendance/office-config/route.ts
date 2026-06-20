import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { officeConfig } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import {
  getOfficeConfig,
  CONFIG_DEFAULTS,
  type OfficeConfigRow,
} from "@/lib/office-config";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const config = await getOfficeConfig();
    return NextResponse.json({ config });
  } catch (err) {
    console.error("GET /api/attendance/office-config:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as Partial<Omit<OfficeConfigRow, "id">>;

    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    const current = await getOfficeConfig();

    // Validate standard times
    if (body.break_start_time && !timeRe.test(body.break_start_time))
      return NextResponse.json(
        { error: "Invalid start time format" },
        { status: 400 },
      );
    if (body.break_end_time && !timeRe.test(body.break_end_time))
      return NextResponse.json(
        { error: "Invalid end time format" },
        { status: 400 },
      );

    // Validate Friday times if provided
    if (body.break_start_time_friday !== undefined) {
      if (
        body.break_start_time_friday &&
        !timeRe.test(body.break_start_time_friday)
      )
        return NextResponse.json(
          { error: "Invalid Friday start time format" },
          { status: 400 },
        );
    }
    if (body.break_end_time_friday !== undefined) {
      if (
        body.break_end_time_friday &&
        !timeRe.test(body.break_end_time_friday)
      )
        return NextResponse.json(
          { error: "Invalid Friday end time format" },
          { status: 400 },
        );
    }
    if (
      body.break_start_time_friday &&
      body.break_end_time_friday &&
      body.break_start_time_friday >= body.break_end_time_friday
    ) {
      return NextResponse.json(
        { error: "Friday end must be after start" },
        { status: 400 },
      );
    }

    const newValues = {
      // ... existing fields logic ...
      office_start: body.office_start ?? current.office_start,
      office_end: body.office_end ?? current.office_end,
      checkin_window_minutes:
        body.checkin_window_minutes ?? current.checkin_window_minutes,
      checkout_window_minutes:
        body.checkout_window_minutes ?? current.checkout_window_minutes,
      break_start_time: body.break_start_time ?? current.break_start_time,
      break_end_time: body.break_end_time ?? current.break_end_time,

      break_start_time_friday:
        body.break_start_time_friday ?? current.break_start_time_friday,
      break_end_time_friday:
        body.break_end_time_friday ?? current.break_end_time_friday,

      break_minutes_default:
        body.break_minutes_default ?? current.break_minutes_default,
      break_minutes_friday:
        body.break_minutes_friday ?? current.break_minutes_friday,
      break_tracking_enabled:
        body.break_tracking_enabled ?? current.break_tracking_enabled,
      break_grace_minutes:
        body.break_grace_minutes ?? current.break_grace_minutes,

      // ➕ NEW
      beneficiary_minutes_default:
        body.beneficiary_minutes_default ?? current.beneficiary_minutes_default,

      created_by: session.user.id,
      updated_at: new Date(),
    };

    const existing = await db
      .select({ id: officeConfig.id })
      .from(officeConfig)
      .orderBy(desc(officeConfig.created_at))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (existing && existing.id !== "default") {
      await db
        .update(officeConfig)
        .set(newValues)
        .where(eq(officeConfig.id, existing.id));
      return NextResponse.json({ success: true, id: existing.id });
    } else {
      const id = uuid();
      await db.insert(officeConfig).values({ id, ...newValues });
      return NextResponse.json({ success: true, id }, { status: 201 });
    }
  } catch (err) {
    console.error("POST /api/attendance/office-config:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
