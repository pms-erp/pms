import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { payroll, attendance, users, breakSessions } from "@/db/schema";
import { eq, and, desc, isNotNull, inArray, sql } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import {
  recalculateUserPayroll,
  recalculatePayrollForMonth,
  toLocalDateString,
  toMonthStartDate,
  toMonthEndDate,
} from "@/lib/payroll-calculator";
import { getOfficeConfig } from "@/lib/office-config";

function dateEq(col: Column, dateStr: string) {
  return sql`${col} = ${dateStr}`;
}
function dateGte(col: Column, dateStr: string) {
  return sql`${col} >= ${dateStr}`;
}
function dateLte(col: Column, dateStr: string) {
  return sql`${col} <= ${dateStr}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: userId, role } = session.user;
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const targetUser = searchParams.get("userId");

    const filterUserId = role === "ADMIN" ? (targetUser ?? null) : userId;
    const conditions = [];
    if (filterUserId) conditions.push(eq(payroll.user_id, filterUserId));
    if (monthParam) {
      const monthStr = toLocalDateString(toMonthStartDate(monthParam));
      conditions.push(dateEq(payroll.month, monthStr));
    }

    const records = await db
      .select({
        id: payroll.id,
        user_id: payroll.user_id,
        month: payroll.month,
        working_days: payroll.working_days,
        daily_work_minutes: payroll.daily_work_minutes,
        break_minutes: payroll.break_minutes,
        break_minutes_friday: payroll.break_minutes_friday,
        expected_minutes: payroll.expected_minutes,
        actual_minutes: payroll.actual_minutes,
        diff_minutes: payroll.diff_minutes,
        base_salary: payroll.base_salary,
        per_minute_rate: payroll.per_minute_rate,
        excused_days: payroll.excused_days,
        beneficiary_minutes: payroll.beneficiary_minutes,
        remaining_amount: payroll.remaining_amount,
        extra_pay: payroll.extra_pay,
        deduction: payroll.deduction,
        work_deduction: payroll.work_deduction,
        break_deduction: payroll.break_deduction,
        manual_deduction_minutes: payroll.manual_deduction_minutes,
        manual_deduction: payroll.manual_deduction,
        final_salary: payroll.final_salary,
        status: payroll.status,
        notes: payroll.notes,
        created_at: payroll.created_at,
        updated_at: payroll.updated_at,
        userName: users.name,
        userAvatar: users.avatar,
        userRole: users.role,
        bankName: users.bank_name,
        bankAccountNumber: users.bank_account_number,
        bankAccountTitle: users.bank_account_title,
      })
      .from(payroll)
      .leftJoin(users, eq(payroll.user_id, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(payroll.month), users.name);

    const serialized = records.map((r) => ({
      ...r,
      month:
        r.month instanceof Date
          ? toLocalDateString(r.month)
          : String(r.month).slice(0, 10),
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : r.created_at,
      updated_at:
        r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : r.updated_at,
    }));

    return NextResponse.json({ records: serialized });
  } catch (err) {
    console.error("GET /api/payroll:", err);
    return NextResponse.json(
      { error: "Failed to fetch payroll" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as { user_id: string; month: string };
    if (!body.user_id || !body.month)
      return NextResponse.json(
        { error: "user_id and month required" },
        { status: 400 },
      );

    await recalculateUserPayroll(body.user_id, toMonthStartDate(body.month));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/payroll:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 401 });

    const body = await req.json();

    // ── Case 1: Bulk month recalculate ──────────────────────────────────────
    if (body.month && !body.id) {
      const result = await recalculatePayrollForMonth(
        toMonthStartDate(body.month),
      );

      if (result.noConfig) {
        return NextResponse.json(
          {
            error: `No attendance config found for this month. Create one in Work Config first.`,
          },
          { status: 400 },
        );
      }

      const message =
        result.errorCount > 0
          ? `Recalculated for ${result.updatedCount} users (${result.errorCount} failed — check server logs)`
          : `Recalculated for ${result.updatedCount} users`;

      return NextResponse.json({
        success: true,
        recalculated: result.updatedCount,
        errors: result.errorCount,
        message,
      });
    }

    if (!body.id)
      return NextResponse.json(
        { error: "Provide id or month" },
        { status: 400 },
      );

    // ── Case 2: Update excused_days (and optionally remaining_amount) ────────
    if (
      body.excused_days !== undefined ||
      body.remaining_amount !== undefined
    ) {
      const existing = await db
        .select({
          id: payroll.id,
          user_id: payroll.user_id,
          month: payroll.month,
          base_salary: payroll.base_salary,
          per_minute_rate: payroll.per_minute_rate,
          working_days: payroll.working_days,
          daily_work_minutes: payroll.daily_work_minutes,
          break_minutes: payroll.break_minutes,
          break_minutes_friday: payroll.break_minutes_friday,
          expected_minutes: payroll.expected_minutes,
          beneficiary_minutes: payroll.beneficiary_minutes,
          remaining_amount: payroll.remaining_amount,
          excused_days: payroll.excused_days,
          manual_deduction_minutes: payroll.manual_deduction_minutes,
        })
        .from(payroll)
        .where(eq(payroll.id, body.id))
        .limit(1)
        .then((r) => r[0] ?? null);

      if (!existing)
        return NextResponse.json(
          { error: "Record not found" },
          { status: 404 },
        );

      const monthStart =
        existing.month instanceof Date
          ? new Date(existing.month.getFullYear(), existing.month.getMonth(), 1)
          : toMonthStartDate(String(existing.month).slice(0, 10));

      const monthEnd = toMonthEndDate(monthStart);
      const monthStr = toLocalDateString(monthStart);
      const monthEndStr = toLocalDateString(monthEnd);

      // Use updated values if provided, else keep existing
      const excused_days =
        body.excused_days !== undefined
          ? (body.excused_days as number)
          : (existing.excused_days ?? 0);

      const remaining_amount =
        body.remaining_amount !== undefined
          ? parseFloat(String(body.remaining_amount))
          : parseFloat(String(existing.remaining_amount ?? 0));

      const manual_deduction_minutes =
        body.manual_deduction_minutes !== undefined
          ? Math.max(
              0,
              parseInt(String(body.manual_deduction_minutes), 10) || 0,
            )
          : (existing.manual_deduction_minutes ?? 0);

      const attRows = await db
        .select({
          id: attendance.id,
          total_hours: attendance.total_hours,
          status: attendance.status,
        })
        .from(attendance)
        .where(
          and(
            eq(attendance.user_id, existing.user_id),
            dateGte(attendance.date, monthStr),
            dateLte(attendance.date, monthEndStr),
          ),
        );

      // Only sum hours from non-ABSENT rows — ABSENT rows have no worked time
      const raw_actual_minutes = attRows
        .filter((r) => String(r.status ?? "").toUpperCase() !== "ABSENT")
        .reduce((s, r) => s + parseFloat(String(r.total_hours ?? 0)) * 60, 0);

      // Only fetch breaks for non-ABSENT days
      const attIds = attRows
        .filter((r) => String(r.status ?? "").toUpperCase() !== "ABSENT")
        .map((r) => r.id)
        .filter(Boolean);
      let totalBreakOvertimeMinutes = 0;

      if (attIds.length > 0) {
        const breaks = await db
          .select({ overtime_minutes: breakSessions.overtime_minutes })
          .from(breakSessions)
          .where(
            and(
              inArray(breakSessions.attendance_id, attIds),
              isNotNull(breakSessions.break_end),
            ),
          );
        totalBreakOvertimeMinutes = breaks.reduce(
          (s, b) => s + parseFloat(String(b.overtime_minutes ?? 0)),
          0,
        );
      }

      const officeConf = await getOfficeConfig();
      const expected = existing.expected_minutes;
      const net_per_day =
        existing.working_days > 0 ? expected / existing.working_days : 0;
      const actual = raw_actual_minutes + excused_days * net_per_day;
      const diff = actual - expected;

      const base_salary = parseFloat(String(existing.base_salary));
      const per_minute_rate = existing.per_minute_rate
        ? parseFloat(String(existing.per_minute_rate))
        : base_salary / expected;

      if (actual === 0) {
        // remaining_amount still applied when no attendance
        // Zero attendance = all working days are absences, buffer never applies
        const zero_md =
          base_salary > 0 ? manual_deduction_minutes * per_minute_rate : 0;
        const zeroUpdate: Record<string, unknown> = {
          excused_days,
          beneficiary_minutes: 0,
          remaining_amount: String(remaining_amount.toFixed(2)),
          manual_deduction_minutes,
          manual_deduction: String(zero_md.toFixed(2)),
          actual_minutes: "0.00",
          diff_minutes: String((-expected).toFixed(2)),
          extra_pay: "0.00",
          work_deduction: "0.00",
          break_deduction: "0.00",
          deduction: String(zero_md.toFixed(2)),
          final_salary: String(
            (base_salary - zero_md + remaining_amount).toFixed(2),
          ),
          updated_at: new Date(),
        };
        if (body.status !== undefined) zeroUpdate.status = body.status;
        if (body.notes !== undefined) zeroUpdate.notes = body.notes ?? null;
        await db.update(payroll).set(zeroUpdate).where(eq(payroll.id, body.id));
        return NextResponse.json({ success: true, recalculated: true });
      }

      // ── Absence count (same logic as payroll-calculator.ts) ──────────────
      // Combine two sources:
      // 1. Days missing from attendance (no row) or marked ABSENT
      // 2. Admin-excused days stored in the payroll record
      // Both forfeit buffer; 2+ total forfeit extra pay.
      // Count days actually worked (not ABSENT). Excused days may or may not have
      // attendance rows depending on how admin recorded them — so we use excused_days
      // from the payroll record directly as the authoritative count of leave days.
      const present_days = attRows.filter(
        (r) => String(r.status ?? "").toUpperCase() !== "ABSENT",
      ).length;
      const unexcused_absences = Math.max(
        0,
        existing.working_days - present_days - excused_days,
      );
      const absence_count = unexcused_absences + excused_days;

      // Extra pay is forfeited entirely when the employee has 2+ absences.
      const extra_pay_eligible = absence_count < 2;
      // ─────────────────────────────────────────────────────────────────────

      const bufferMinutes =
        existing.beneficiary_minutes ??
        officeConf.beneficiary_minutes_default ??
        0;

      // Buffer is forfeited if the employee has ANY absence (excused or not).
      const effectiveBufferMinutes = absence_count > 0 ? 0 : bufferMinutes;

      const extra = extra_pay_eligible && diff > 0 ? diff * per_minute_rate : 0;
      const workShortage = diff < 0 ? Math.abs(diff) : 0;
      // Buffer absorbs: 1) work shortage, 2) break overtime, 3) manual deduction
      const bufferUsedForWork = Math.min(effectiveBufferMinutes, workShortage);
      const bufferAfterWork = Math.max(
        0,
        effectiveBufferMinutes - bufferUsedForWork,
      );
      const deductibleWork = Math.max(0, workShortage - bufferUsedForWork);

      const bufferUsedForBreak = Math.min(
        bufferAfterWork,
        totalBreakOvertimeMinutes,
      );
      const bufferAfterBreak = Math.max(
        0,
        bufferAfterWork - bufferUsedForBreak,
      );
      const deductibleBreak = Math.max(
        0,
        totalBreakOvertimeMinutes - bufferUsedForBreak,
      );

      // Buffer absorbs manual deduction last — whatever buffer still remains
      const bufferUsedForManual = Math.min(
        bufferAfterBreak,
        manual_deduction_minutes,
      );
      const deductibleManual = Math.max(
        0,
        manual_deduction_minutes - bufferUsedForManual,
      );

      const wd = deductibleWork * per_minute_rate;
      const bd = deductibleBreak * per_minute_rate;
      const md = base_salary > 0 ? deductibleManual * per_minute_rate : 0;
      const total_deduction = wd + bd + md;

      // remaining_amount (signed) added to final salary
      const final_salary =
        base_salary + extra - total_deduction + remaining_amount;

      // Also persist status and notes if provided in the same request
      const salaryUpdate: Record<string, unknown> = {
        excused_days,
        beneficiary_minutes: effectiveBufferMinutes,
        remaining_amount: String(remaining_amount.toFixed(2)),
        manual_deduction_minutes,
        manual_deduction: String(md.toFixed(2)),
        actual_minutes: String(actual.toFixed(2)),
        diff_minutes: String(diff.toFixed(2)),
        extra_pay: String(extra.toFixed(2)),
        work_deduction: String(wd.toFixed(2)),
        break_deduction: String(bd.toFixed(2)),
        deduction: String(total_deduction.toFixed(2)),
        final_salary: String(final_salary.toFixed(2)),
        updated_at: new Date(),
      };
      if (body.status !== undefined) salaryUpdate.status = body.status;
      if (body.notes !== undefined) salaryUpdate.notes = body.notes ?? null;

      await db.update(payroll).set(salaryUpdate).where(eq(payroll.id, body.id));

      return NextResponse.json({ success: true, recalculated: true });
    }

    // ── Case 3: Manual override (status, notes, etc.) ───────────────────────
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status !== undefined) update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes ?? null;
    if (body.final_salary !== undefined)
      update.final_salary = body.final_salary;
    if (body.extra_pay !== undefined) update.extra_pay = body.extra_pay;
    if (body.deduction !== undefined) update.deduction = body.deduction;
    if (body.beneficiary_minutes !== undefined)
      update.beneficiary_minutes = Number(body.beneficiary_minutes);

    await db.update(payroll).set(update).where(eq(payroll.id, body.id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/payroll:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 401 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(payroll).where(eq(payroll.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/payroll:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
