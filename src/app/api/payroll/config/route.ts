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
  const s = monthParam.length === 7 ? `${monthParam}-01` : monthParam;
  const [year, month] = s.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

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

    const mapped = configs.map((c) => ({
      id: c.id,
      month:
        c.month instanceof Date
          ? c.month.toISOString().split("T")[0]
          : String(c.month),
      working_days: c.working_days,
      daily_work_minutes: c.daily_work_minutes,
      notes: c.notes,
    }));

    return NextResponse.json({ configs: mapped });
  } catch (err) {
    console.error("GET /api/payroll/config:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

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

    if (!body.month || !body.working_days || !body.daily_work_minutes) {
      return NextResponse.json(
        { error: "month, working_days and daily_work_minutes are required" },
        { status: 400 },
      );
    }

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
      console.log(`📝 Updated existing config for ${body.month}`);
    } else {
      await db.insert(attendanceConfig).values({
        id: uuid(),
        month: monthDate,
        working_days: body.working_days,
        daily_work_minutes: body.daily_work_minutes,
        notes: body.notes ?? null,
        created_by: session.user.id,
      });
      console.log(`📝 Created new config for ${body.month}`);
    }

    console.log(`🔄 Triggering payroll recalculation for ${body.month}...`);
    // 🔑 recalculatePayrollForMonth now returns { updatedCount, errorCount, noConfig }
    const result = await recalculatePayrollForMonth(monthDate);
    console.log(
      `✅ Payroll recalc complete: ${result.updatedCount} updated, ${result.errorCount} errors`,
    );

    // Build a message that reflects partial failures
    const message =
      result.errorCount > 0
        ? `Config saved & payroll recalculated for ${result.updatedCount} users (${result.errorCount} failed — check server logs)`
        : `Config saved & payroll recalculated for ${result.updatedCount} users`;

    return NextResponse.json(
      {
        success: true,
        recalculated: result.updatedCount,
        errors: result.errorCount,
        message,
        config: {
          month: body.month,
          working_days: body.working_days,
          daily_work_minutes: body.daily_work_minutes,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("❌ POST /api/payroll/config error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

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
    console.error("DELETE /api/payroll/config:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
