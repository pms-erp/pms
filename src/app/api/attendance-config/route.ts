// app/api/attendance-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendanceConfig } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { recalculatePayrollForMonth } from "@/lib/payroll-calculator";

const ADMIN_ONLY = ["ADMIN"];

function toMonthDate(monthParam: string): Date {
  const d = new Date(monthParam);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/attendance-config?month=YYYY-MM   → single config
// GET /api/attendance-config                 → all configs
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const monthParam = new URL(req.url).searchParams.get("month");

    if (monthParam) {
      const monthDate = toMonthDate(monthParam);
      const config = await db
        .select()
        .from(attendanceConfig)
        .where(eq(attendanceConfig.month, monthDate))
        .limit(1)
        .then((r) => r[0] ?? null);
      return NextResponse.json({ config });
    }

    const configs = await db
      .select()
      .from(attendanceConfig)
      .orderBy(desc(attendanceConfig.month));
    return NextResponse.json({ configs });
  } catch (err) {
    console.error("GET /api/attendance-config:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance-config
// Body: { month, working_days, daily_work_minutes, notes? }
//
// NOTE: break_minutes and break_minutes_friday come from officeConfig
//       (set in /api/attendance/office-config). They are NOT stored here
//       to avoid duplication — payroll-calculator.ts reads them from
//       officeConfig at recalc time.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ADMIN_ONLY.includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      month: string;
      working_days: number;
      daily_work_minutes: number;
      notes?: string;
    };

    if (
      !body.month ||
      body.working_days == null ||
      body.daily_work_minutes == null
    )
      return NextResponse.json(
        { error: "month, working_days and daily_work_minutes are required" },
        { status: 400 },
      );

    const monthDate = toMonthDate(body.month);

    const existing = await db
      .select({ id: attendanceConfig.id })
      .from(attendanceConfig)
      .where(eq(attendanceConfig.month, monthDate))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (existing) {
      await db
        .update(attendanceConfig)
        .set({
          working_days: body.working_days,
          daily_work_minutes: body.daily_work_minutes,
          notes: body.notes ?? null,
          updated_at: new Date(),
        })
        .where(eq(attendanceConfig.id, existing.id));
    } else {
      await db.insert(attendanceConfig).values({
        id: uuid(),
        month: monthDate,
        working_days: body.working_days,
        daily_work_minutes: body.daily_work_minutes,
        notes: body.notes ?? null,
        created_by: session.user.id,
      });
    }

    // Recalculate payroll for all users for this month
    const recalculated = await recalculatePayrollForMonth(monthDate);

    return NextResponse.json(
      {
        success: true,
        recalculated,
        message: `Config saved & payroll recalculated for ${recalculated} users`,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST /api/attendance-config:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/attendance-config?id=xxx
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !ADMIN_ONLY.includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(attendanceConfig).where(eq(attendanceConfig.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/attendance-config:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
