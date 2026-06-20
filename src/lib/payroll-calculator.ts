// lib/payroll-calculator.ts
import { db } from "@/db";
import {
  attendance,
  breakSessions,
  payroll,
  users,
  attendanceConfig,
} from "@/db/schema";
import { eq, and, isNotNull, inArray, sql } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getOfficeConfig } from "@/lib/office-config";

export interface PayrollPayload {
  user_id: string;
  month: Date;
  working_days: number;
  daily_work_minutes: number;
  break_minutes: number;
  break_minutes_friday: number;
  expected_minutes: number;
  actual_minutes: string;
  diff_minutes: string;
  base_salary: string;
  per_minute_rate: string;
  excused_days: number;
  beneficiary_minutes: number;
  remaining_amount: string;
  extra_pay: string;
  work_deduction: string;
  break_deduction: string;
  manual_deduction_minutes: number;
  manual_deduction: string;
  deduction: string;
  final_salary: string;
  status: "CALCULATED";
  notes: string | null;
}

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toMonthStartDate(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), 1);
  }
  const s = input.length === 7 ? `${input}-01` : input;
  const [year, month] = s.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function toMonthEndDate(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
}

function dateEq(col: Column, dateStr: string) {
  return sql`${col} = ${dateStr}`;
}
function dateGte(col: Column, dateStr: string) {
  return sql`${col} >= ${dateStr}`;
}
function dateLte(col: Column, dateStr: string) {
  return sql`${col} <= ${dateStr}`;
}

export function calculateExpectedMinutes(opts: {
  monthDate: Date;
  working_days: number;
  daily_work_minutes: number;
  break_minutes: number;
  break_minutes_friday: number;
}): number {
  const {
    monthDate,
    working_days,
    daily_work_minutes,
    break_minutes,
    break_minutes_friday,
  } = opts;

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let lastSat = -1;
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, month, d).getDay() === 6) {
      lastSat = d;
      break;
    }
  }

  const calendarWorkingDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const pktDate = new Date(`${dateStr}T12:00:00+05:00`);
    const dow = pktDate.getUTCDay();

    if (dow === 0) continue;
    if (dow === 6 && d === lastSat) continue;
    calendarWorkingDays.push(dow);
  }

  const effectiveDays = calendarWorkingDays.slice(
    0,
    Math.min(working_days, calendarWorkingDays.length),
  );

  let total = 0;
  for (const dow of effectiveDays) {
    const breakMins = dow === 5 ? break_minutes_friday : break_minutes;
    total += daily_work_minutes - breakMins;
  }

  return total;
}

export async function recalculateUserPayroll(
  userId: string,
  monthDate: Date,
): Promise<void> {
  const monthStart = toMonthStartDate(monthDate);
  const monthEnd = toMonthEndDate(monthStart);
  const monthStr = toLocalDateString(monthStart);
  const monthEndStr = toLocalDateString(monthEnd);

  // 1. Fetch Config
  const config = await db
    .select()
    .from(attendanceConfig)
    .where(dateEq(attendanceConfig.month, monthStr))
    .limit(1)
    .then((r) => r[0] ?? null);

  const officeConf = await getOfficeConfig();

  const working_days = config?.working_days ?? 22;
  const daily_work_minutes = config?.daily_work_minutes ?? 510;
  const break_minutes = officeConf?.break_minutes_default ?? 30;
  const break_minutes_friday = officeConf?.break_minutes_friday ?? 60;
  const bufferMinutes = officeConf?.beneficiary_minutes_default ?? 0;

  const expected_minutes = calculateExpectedMinutes({
    monthDate: monthStart,
    working_days,
    daily_work_minutes,
    break_minutes,
    break_minutes_friday,
  });

  // 2. Fetch User
  const user = await db
    .select({
      id: users.id,
      name: users.name,
      base_salary: users.base_salary,
      per_minute_rate: users.per_minute_rate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!user) {
    console.error(`❌ User not found: ${userId}`);
    return;
  }

  const base_salaryVal = parseFloat(String(user.base_salary ?? 0));
  const safeExpected = expected_minutes > 0 ? expected_minutes : 1;

  const per_minute_rateVal = user.per_minute_rate
    ? parseFloat(String(user.per_minute_rate))
    : base_salaryVal / safeExpected;

  // 3. Fetch Attendance
  const attendanceRows = await db
    .select({
      id: attendance.id,
      total_hours: attendance.total_hours,
      status: attendance.status,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.user_id, userId),
        dateGte(attendance.date, monthStr),
        dateLte(attendance.date, monthEndStr),
      ),
    );

  // Only sum hours from non-ABSENT rows — ABSENT rows have no worked time
  // Normalize status to uppercase to handle any DB case differences
  const raw_actual_minutes = attendanceRows
    .filter((r) => String(r.status ?? "").toUpperCase() !== "ABSENT")
    .reduce(
      (sum, r) => sum + (parseFloat(String(r.total_hours ?? 0)) * 60 || 0),
      0,
    );

  // 4. Fetch Existing Payroll Record
  const existingRecord = await db
    .select({
      id: payroll.id,
      excused_days: payroll.excused_days,
      remaining_amount: payroll.remaining_amount,
      manual_deduction_minutes: payroll.manual_deduction_minutes,
      status: payroll.status,
      notes: payroll.notes,
    })
    .from(payroll)
    .where(and(eq(payroll.user_id, userId), dateEq(payroll.month, monthStr)))
    .limit(1)
    .then((r) => r[0] ?? null);

  const excused_days = existingRecord?.excused_days ?? 0;
  // Preserve existing remaining_amount; default to 0 for new records
  const remaining_amount = parseFloat(
    String(existingRecord?.remaining_amount ?? 0),
  );
  // Preserve manual_deduction_minutes; default to 0 for new records
  const manual_deduction_minutes =
    existingRecord?.manual_deduction_minutes ?? 0;

  const net_per_day = working_days > 0 ? expected_minutes / working_days : 0;
  const actual_work_minutes = raw_actual_minutes + excused_days * net_per_day;

  // ── Absence count ───────────────────────────────────────────────────────────
  // Combine two sources:
  // 1. Days missing from attendance (no row) or marked ABSENT
  // 2. Admin-excused days stored in the payroll record
  // Both forfeit buffer; 2+ total forfeit extra pay.
  // Count days actually worked (not ABSENT). Excused days may or may not have
  // attendance rows depending on how admin recorded them — so we use excused_days
  // from the payroll record directly as the authoritative count of leave days.
  const present_days = attendanceRows.filter(
    (r) => String(r.status ?? "").toUpperCase() !== "ABSENT",
  ).length;
  // Unexcused absences = working days not covered by attendance OR excused leave
  const unexcused_absences = Math.max(
    0,
    working_days - present_days - excused_days,
  );
  // Total absences for policy purposes = unexcused + excused (both forfeit buffer;
  // 2+ forfeit extra pay). Simplifies to: working_days - non-absent-rows.
  const absence_count = unexcused_absences + excused_days;

  // ── Buffer eligibility ──────────────────────────────────────────────────────
  // Buffer is forfeited if the employee has ANY absence (excused or not).
  const effectiveBufferMinutes = absence_count > 0 ? 0 : bufferMinutes;
  // ────────────────────────────────────────────────────────────────────────────

  // 5. Build Base Payload
  const basePayload = {
    user_id: userId,
    month: monthStart,
    working_days,
    daily_work_minutes,
    break_minutes,
    break_minutes_friday,
    expected_minutes,
    base_salary: String(base_salaryVal.toFixed(2)),
    per_minute_rate: String(per_minute_rateVal.toFixed(4)),
    excused_days,
    beneficiary_minutes: effectiveBufferMinutes,
    remaining_amount: String(remaining_amount.toFixed(2)),
    manual_deduction_minutes,
    status: "CALCULATED" as const,
    notes: existingRecord?.notes ?? null,
  };

  // 6. Calculate Salary Logic
  let final_payload;

  if (actual_work_minutes === 0 || isNaN(actual_work_minutes)) {
    // Zero attendance case — remaining_amount still applied
    const zero_manual_deduction =
      base_salaryVal > 0 ? manual_deduction_minutes * per_minute_rateVal : 0;
    final_payload = {
      ...basePayload,
      actual_minutes: "0.00",
      diff_minutes: String((-expected_minutes).toFixed(2)),
      extra_pay: "0.00",
      work_deduction: "0.00",
      break_deduction: "0.00",
      manual_deduction_minutes,
      manual_deduction: String(zero_manual_deduction.toFixed(2)),
      deduction: String(zero_manual_deduction.toFixed(2)),
      final_salary: String(
        (base_salaryVal - zero_manual_deduction + remaining_amount).toFixed(2),
      ),
    };
  } else {
    // Break Overtime Calculation
    let totalBreakOvertimeMinutes = 0;
    if (officeConf?.break_tracking_enabled && attendanceRows.length > 0) {
      // Only fetch breaks for non-ABSENT days
      const attendanceIds = attendanceRows
        .filter((r) => String(r.status ?? "").toUpperCase() !== "ABSENT")
        .map((r) => r.id)
        .filter(Boolean);
      const breaks = await db
        .select({ overtime_minutes: breakSessions.overtime_minutes })
        .from(breakSessions)
        .where(
          and(
            inArray(breakSessions.attendance_id, attendanceIds),
            isNotNull(breakSessions.break_end),
          ),
        );

      totalBreakOvertimeMinutes = breaks.reduce(
        (sum, b) => sum + (parseFloat(String(b.overtime_minutes ?? 0)) || 0),
        0,
      );
    }

    const diff_minutes = actual_work_minutes - expected_minutes;

    // ── Extra Pay rule ──────────────────────────────────────────────────────
    // Extra pay (overtime) is only awarded if the employee has fewer than 2
    // absences. With 2 or more absences, extra pay is forfeited entirely.
    const extra_pay_eligible = absence_count < 2;

    const work_extra_pay =
      extra_pay_eligible && diff_minutes > 0 && base_salaryVal > 0
        ? diff_minutes * per_minute_rateVal
        : 0;
    // ────────────────────────────────────────────────────────────────────────

    const workShortage = diff_minutes < 0 ? Math.abs(diff_minutes) : 0;

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
    const bufferAfterBreak = Math.max(0, bufferAfterWork - bufferUsedForBreak);
    const deductibleBreak = Math.max(
      0,
      totalBreakOvertimeMinutes - bufferUsedForBreak,
    );

    // Buffer absorbs manual deduction last — whatever buffer is still remaining
    const bufferUsedForManual = Math.min(
      bufferAfterBreak,
      manual_deduction_minutes,
    );
    const deductibleManual = Math.max(
      0,
      manual_deduction_minutes - bufferUsedForManual,
    );

    // Deductions
    const work_deduction =
      base_salaryVal > 0 ? deductibleWork * per_minute_rateVal : 0;
    const break_deduction =
      base_salaryVal > 0 ? deductibleBreak * per_minute_rateVal : 0;

    // Manual minute deduction after buffer absorption
    const manual_deduction =
      base_salaryVal > 0 ? deductibleManual * per_minute_rateVal : 0;

    const total_deduction = work_deduction + break_deduction + manual_deduction;

    // remaining_amount is signed: positive adds to salary, negative deducts
    const final_salary =
      base_salaryVal + work_extra_pay - total_deduction + remaining_amount;

    final_payload = {
      ...basePayload,
      actual_minutes: String(actual_work_minutes.toFixed(2)),
      diff_minutes: String(diff_minutes.toFixed(2)),
      extra_pay: String(work_extra_pay.toFixed(2)),
      work_deduction: String(work_deduction.toFixed(2)),
      break_deduction: String(break_deduction.toFixed(2)),
      manual_deduction_minutes,
      manual_deduction: String(manual_deduction.toFixed(2)),
      deduction: String(total_deduction.toFixed(2)),
      final_salary: String(final_salary.toFixed(2)),
    };
  }

  // 7. Upsert to Database
  try {
    if (existingRecord) {
      await db
        .update(payroll)
        .set({ ...final_payload, updated_at: new Date() })
        .where(eq(payroll.id, existingRecord.id));
    } else {
      await db.insert(payroll).values({ id: uuid(), ...final_payload });
    }
  } catch (err) {
    console.error(`❌ DB Error upserting payroll for ${user.name}:`, err);
    throw err;
  }
}

export async function recalculatePayrollForMonth(
  monthDate: Date,
): Promise<{ updatedCount: number; errorCount: number; noConfig: boolean }> {
  const monthStart = toMonthStartDate(monthDate);
  const monthStr = toLocalDateString(monthStart);

  const config = await db
    .select()
    .from(attendanceConfig)
    .where(dateEq(attendanceConfig.month, monthStr))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!config) {
    console.warn(
      `⚠️ No config for ${monthStr}. Create one in Work Config first.`,
    );
    return { updatedCount: 0, errorCount: 0, noConfig: true };
  }

  const allUsers = await db
    .select({
      id: users.id,
      base_salary: users.base_salary,
      name: users.name,
      is_active: users.is_active,
    })
    .from(users)
    .where(eq(users.is_active, true));

  let updatedCount = 0;
  let errorCount = 0;

  for (const user of allUsers) {
    try {
      await recalculateUserPayroll(user.id, monthStart);
      updatedCount++;
    } catch (err) {
      errorCount++;
      console.error(`❌ Failed for ${user.name} (${user.id}):`, err);
    }
  }

  console.log(
    `🎉 Recalc Complete: ${updatedCount} updated, ${errorCount} errors`,
  );
  return { updatedCount, errorCount, noConfig: false };
}
