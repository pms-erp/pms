// app/api/attendance/import/route.ts
//
// Accepts the SAME Excel format produced by /api/attendance/export.
// Row 1: Title (skip)
// Row 2: Stats (skip)
// Row 3: Headers — #, Employee, Role, Date, Check In, Check Out, Total Hours, Status, Notes
// Row 4+: Data rows (actual attendance records)
//
// Logic:
//   1. Match each row's Employee name → look up user_id in DB (case-insensitive)
//   2. Parse Date, Check In, Check Out as PKT (UTC+5) → store as UTC
//   3. Batch-check which (user_id, date) pairs already exist
//   4. Skip duplicates, insert the rest in one bulk query
//   5. Return { inserted, skipped, errors }
//
// Auth: ADMIN and ATTENDANCE_MANAGER only.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, users } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
import { v4 as uuid } from "uuid";

// ── Month name → 0-indexed number ────────────────────────────────────────────
const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

// ── Parse "Mon, May 18, 2026" or "May 18, 2026" → "YYYY-MM-DD" ───────────────
function parseDateStr(str: string): string | null {
  if (!str || str === "—") return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // "Mon, May 18, 2026" or "May 18, 2026"
  const m = str.match(/(?:\w{3},\s+)?(\w{3})\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const month = MONTH_MAP[m[1]];
    if (month !== undefined) {
      return `${m[3]}-${String(month + 1).padStart(2, "0")}-${String(parseInt(m[2])).padStart(2, "0")}`;
    }
  }
  return null;
}

// ── Parse "09:05 AM" + date → UTC Date (treating input as PKT) ───────────────
function parseTimePKT(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr || timeStr === "—") return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  // Treat as PKT (UTC+5) → store as UTC
  const d = new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+05:00`,
  );
  return isNaN(d.getTime()) ? null : d;
}

// ── Cell → string ─────────────────────────────────────────────────────────────
function cellStr(val: XLSX.CellObject["v"] | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

// ── Bulk insert chunk size ────────────────────────────────────────────────────
// Keep each chunk well under MySQL max_allowed_packet.
const CHUNK = 200;

export async function POST(req: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (
      session.user.role !== "ADMIN" &&
      session.user.role !== "ATTENDANCE_MANAGER"
    )
      return NextResponse.json(
        { error: "Forbidden — admin or attendance manager only" },
        { status: 403 },
      );

    // ── Read file ────────────────────────────────────────────────────────────
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file)
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xlsx" && ext !== "xls")
      return NextResponse.json(
        { error: "Only .xlsx or .xls files are accepted" },
        { status: 400 },
      );

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName)
      return NextResponse.json(
        { error: "Workbook has no sheets" },
        { status: 400 },
      );

    const sheet = workbook.Sheets[sheetName];

    // ── Sheet → 2D array (rows × cols) ─────────────────────────────────────
    // raw: true keeps values as strings; header: 1 gives array-of-arrays
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false, // format numbers/dates as strings
    });

    // Rows 0 (title), 1 (stats), 2 (headers) are skipped.
    // Data starts at index 3.
    const dataRows = rows.slice(3);

    if (dataRows.length === 0)
      return NextResponse.json(
        { error: "No data rows found (expected data from row 4 onward)" },
        { status: 400 },
      );

    // ── Load all active users → name Map ────────────────────────────────────
    const allUsers = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(eq(users.is_active, true));

    // Map lowercase name → first matching user
    const userByName = new Map<
      string,
      { id: string; name: string; role: string }
    >();
    for (const u of allUsers) {
      userByName.set(u.name.toLowerCase().trim(), u);
    }

    // ── Parse each data row ──────────────────────────────────────────────────
    type ParsedRow = {
      user_id: string;
      date: string; // "YYYY-MM-DD"
      check_in: Date;
      check_out: Date | null;
      total_hours: string | null;
      status: "PRESENT" | "HALF_DAY" | "ABSENT";
      notes: string | null;
    };

    const parsed: ParsedRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 4; // 1-indexed Excel row

      // Skip blank rows and summary section rows
      // A data row has a numeric value in col 0 (#)
      const colNum = cellStr(row[0] as XLSX.CellObject["v"]);
      if (!colNum || isNaN(Number(colNum))) continue;

      const colEmployee = cellStr(row[1] as XLSX.CellObject["v"]);
      const colDate = cellStr(row[3] as XLSX.CellObject["v"]);
      const colCheckIn = cellStr(row[4] as XLSX.CellObject["v"]);
      const colCheckOut = cellStr(row[5] as XLSX.CellObject["v"]);
      const colStatusRaw = cellStr(row[7] as XLSX.CellObject["v"]);
      const colNotes = cellStr(row[8] as XLSX.CellObject["v"]);

      // ── Skip rows we can't do anything with ─────────────────────────────
      if (!colEmployee || colEmployee === "—") {
        errors.push(`Row ${rowNum}: Empty employee name — skipped`);
        continue;
      }
      if (!colDate || colDate === "—") {
        errors.push(`Row ${rowNum}: Empty date — skipped`);
        continue;
      }
      if (!colCheckIn || colCheckIn === "—") {
        // Absent records without a check-in time can't be stored (check_in NOT NULL)
        continue; // silent skip — absent rows are expected to be missing
      }

      // ── Match user ───────────────────────────────────────────────────────
      const user = userByName.get(colEmployee.toLowerCase().trim());
      if (!user) {
        errors.push(
          `Row ${rowNum}: No active user named "${colEmployee}" — skipped`,
        );
        continue;
      }

      // ── Parse date ───────────────────────────────────────────────────────
      const dateStr = parseDateStr(colDate);
      if (!dateStr) {
        errors.push(`Row ${rowNum}: Cannot parse date "${colDate}" — skipped`);
        continue;
      }

      // ── Parse times as PKT ───────────────────────────────────────────────
      const checkInDate = parseTimePKT(dateStr, colCheckIn);
      if (!checkInDate) {
        errors.push(
          `Row ${rowNum}: Cannot parse check-in time "${colCheckIn}" — skipped`,
        );
        continue;
      }
      const checkOutDate = parseTimePKT(dateStr, colCheckOut);

      // ── Total hours (recalculate from times for accuracy) ────────────────
      let total_hours: string | null = null;
      if (checkOutDate) {
        const ms = checkOutDate.getTime() - checkInDate.getTime();
        if (ms > 0) total_hours = (ms / 3_600_000).toFixed(2);
      }

      // ── Status ───────────────────────────────────────────────────────────
      const statusUpper = colStatusRaw.toUpperCase().replace(/\s/g, "_");
      const status: "PRESENT" | "HALF_DAY" | "ABSENT" =
        statusUpper === "HALF_DAY"
          ? "HALF_DAY"
          : statusUpper === "ABSENT"
            ? "ABSENT"
            : "PRESENT";

      parsed.push({
        user_id: user.id,
        date: dateStr,
        check_in: checkInDate,
        check_out: checkOutDate,
        total_hours,
        status,
        notes: colNotes || null,
      });
    }

    if (parsed.length === 0) {
      return NextResponse.json({
        inserted: 0,
        skipped: 0,
        errors,
        message: "No valid rows found to import.",
      });
    }

    // ── Batch duplicate check ─────────────────────────────────────────────
    // Fetch all existing attendance for the date range in the file.
    // Build a Set of "userId|YYYY-MM-DD" keys → O(1) lookup per row.
    const dates = [...new Set(parsed.map((r) => r.date))].sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const userIds = [...new Set(parsed.map((r) => r.user_id))];

    const existing = await db
      .select({ user_id: attendance.user_id, date: attendance.date })
      .from(attendance)
      .where(
        and(
          inArray(attendance.user_id, userIds),
          sql`${attendance.date} >= ${minDate}`,
          sql`${attendance.date} <= ${maxDate}`,
        ),
      );

    // Build key set — handle both Date objects and "YYYY-MM-DD" strings
    const existingKeys = new Set<string>();
    for (const row of existing) {
      const d =
        row.date instanceof Date
          ? row.date.toISOString().split("T")[0]
          : String(row.date).split("T")[0];
      existingKeys.add(`${row.user_id}|${d}`);
    }

    // ── Split into insert vs skip ─────────────────────────────────────────
    const toInsert = parsed.filter(
      (r) => !existingKeys.has(`${r.user_id}|${r.date}`),
    );
    const skipped = parsed.length - toInsert.length;

    // ── Bulk insert in chunks ─────────────────────────────────────────────
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const values = chunk.map((r) => ({
        id: uuid(),
        user_id: r.user_id,
        date: sql`${r.date}`, // literal string → MySQL DATE column
        check_in: r.check_in,
        check_out: r.check_out,
        total_hours: r.total_hours,
        status: r.status,
        notes: r.notes,
      }));

      await db.insert(attendance).values(values);
      inserted += chunk.length;
    }

    return NextResponse.json({
      inserted,
      skipped,
      errors,
      message: `Import complete: ${inserted} added, ${skipped} already existed (skipped)${errors.length ? `, ${errors.length} rows had issues` : ""}.`,
    });
  } catch (err) {
    console.error("POST /api/attendance/import:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
