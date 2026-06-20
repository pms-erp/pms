// app/api/attendance/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, users } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";

// ─── Who can export? ──────────────────────────────────────────────────────────
// ADMIN and ATTENDANCE_MANAGER → all staff
// TEAM_LEADER                  → own + team
// Others                       → own only
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: userId, role } = session.user;
    const { searchParams } = new URL(req.url);

    // ?month=2026-05  (YYYY-MM)
    const monthParam = searchParams.get("month");
    const now = new Date();
    const month = monthParam
      ? monthParam
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [year, mon] = month.split("-").map(Number);
    const fromDate = `${year}-${String(mon).padStart(2, "0")}-01`;
    const lastDay = new Date(year, mon, 0).getDate();
    const toDate = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // ── Build user filter ────────────────────────────────────────────────────
    let userIdFilter: string[] | null = null;

    if (role === "ADMIN" || role === "ATTENDANCE_MANAGER") {
      userIdFilter = null; // all staff
    } else if (role === "TEAM_LEADER") {
      const leaderRow = await db
        .select({ team_type: users.team_type })
        .from(users)
        .where(eq(users.id, userId))
        .then((r) => r[0] ?? null);

      if (leaderRow?.team_type) {
        const members = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.team_type, leaderRow.team_type));
        userIdFilter = [...new Set([userId, ...members.map((u) => u.id)])];
      } else {
        userIdFilter = [userId];
      }
    } else {
      userIdFilter = [userId];
    }
    // ─────────────────────────────────────────────────────────────────────────

    const filters = [
      sql`${attendance.date} >= ${fromDate}`,
      sql`${attendance.date} <= ${toDate}`,
    ];

    if (userIdFilter !== null) {
      filters.push(
        userIdFilter.length === 1
          ? eq(attendance.user_id, userIdFilter[0])
          : inArray(attendance.user_id, userIdFilter),
      );
    }

    const records = await db
      .select({
        id: attendance.id,
        user_id: attendance.user_id,
        date: attendance.date,
        check_in: attendance.check_in,
        check_out: attendance.check_out,
        total_hours: attendance.total_hours,
        status: attendance.status,
        notes: attendance.notes,
        userName: users.name,
        userRole: users.role,
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.user_id, users.id))
      .where(and(...filters))
      .orderBy(users.name, attendance.date);

    // ── Build workbook ────────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TAIBA Digital";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Attendance", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
      views: [{ state: "frozen", ySplit: 3 }],
    });

    // ── Month label row (merged, styled) ────────────────────────────────────
    const monthLabel = new Date(year, mon - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });

    sheet.mergeCells("A1:H1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = `Attendance Report — ${monthLabel}`;
    titleCell.font = {
      name: "Calibri",
      bold: true,
      size: 14,
      color: { argb: "FFFFFFFF" },
    };
    titleCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 32;

    // ── Stats row ────────────────────────────────────────────────────────────
    const totalPresent = records.filter((r) => r.status === "PRESENT").length;
    const totalHalfDay = records.filter((r) => r.status === "HALF_DAY").length;
    const totalAbsent = records.filter((r) => r.status === "ABSENT").length;
    const checkedOut = records.filter((r) => r.check_out);
    const avgHours =
      checkedOut.length > 0
        ? (
            checkedOut.reduce(
              (s, r) => s + parseFloat(String(r.total_hours ?? 0)),
              0,
            ) / checkedOut.length
          ).toFixed(1)
        : "0.0";

    sheet.mergeCells("A2:H2");
    const statsCell = sheet.getCell("A2");
    statsCell.value = `Total: ${records.length}  |  Present: ${totalPresent}  |  Half Day: ${totalHalfDay}  |  Absent: ${totalAbsent}  |  Avg Hours/Day: ${avgHours}h`;
    statsCell.font = { name: "Calibri", size: 10, color: { argb: "FF1E3A5F" } };
    statsCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8F0FB" },
    };
    statsCell.alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(2).height = 22;

    // ── Column headers ────────────────────────────────────────────────────────
    const headers = [
      { header: "#", key: "no", width: 5 },
      { header: "Employee", key: "name", width: 24 },
      { header: "Role", key: "role", width: 18 },
      { header: "Date", key: "date", width: 14 },
      { header: "Check In", key: "check_in", width: 12 },
      { header: "Check Out", key: "check_out", width: 12 },
      { header: "Total Hours", key: "total_hours", width: 13 },
      { header: "Status", key: "status", width: 12 },
      { header: "Notes", key: "notes", width: 30 },
    ];

    sheet.columns = headers;

    const headerRow = sheet.getRow(3);
    headerRow.values = [
      "#",
      "Employee",
      "Role",
      "Date",
      "Check In",
      "Check Out",
      "Total Hours",
      "Status",
      "Notes",
    ];
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.font = {
        name: "Calibri",
        bold: true,
        size: 11,
        color: { argb: "FFFFFFFF" },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2B5797" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF1E3A5F" } },
      };
    });

    // ── Status colors ─────────────────────────────────────────────────────────
    const STATUS_COLORS: Record<string, { fill: string; font: string }> = {
      PRESENT: { fill: "FFE6F4EA", font: "FF1E7E34" },
      HALF_DAY: { fill: "FFFFF3CD", font: "FF856404" },
      ABSENT: { fill: "FFFCE8E6", font: "FFC62828" },
    };

    // ── Data rows ────────────────────────────────────────────────────────────
    let rowIndex = 0;
    for (const rec of records) {
      rowIndex++;

      const checkIn =
        rec.check_in instanceof Date
          ? rec.check_in
          : rec.check_in
            ? new Date(rec.check_in)
            : null;
      const checkOut =
        rec.check_out instanceof Date
          ? rec.check_out
          : rec.check_out
            ? new Date(rec.check_out)
            : null;
      const dateVal =
        rec.date instanceof Date
          ? rec.date
          : rec.date
            ? new Date(rec.date)
            : null;

      const formatTime = (d: Date | null) =>
        d
          ? d.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : "—";

      const formatDate = (d: Date | null) =>
        d
          ? d.toLocaleDateString("en-US", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "—";

      const dataRow = sheet.addRow([
        rowIndex,
        rec.userName ?? "—",
        rec.userRole ?? "—",
        formatDate(dateVal),
        formatTime(checkIn),
        formatTime(checkOut),
        rec.total_hours
          ? `${parseFloat(String(rec.total_hours)).toFixed(2)}h`
          : "—",
        rec.status ?? "—",
        rec.notes ?? "",
      ]);

      // Alternating row background
      const isEven = rowIndex % 2 === 0;
      const statusColor = STATUS_COLORS[rec.status ?? ""] ?? null;

      dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: "Calibri", size: 10 };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNumber <= 3 ? "left" : "center",
        };

        if (!isEven) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF7F9FC" },
          };
        }

        // Status column (col 8) gets color badge treatment
        if (colNumber === 8 && statusColor) {
          cell.font = {
            name: "Calibri",
            size: 10,
            bold: true,
            color: { argb: statusColor.font },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: statusColor.fill },
          };
        }
      });

      dataRow.height = 20;
    }

    // ── Summary section ───────────────────────────────────────────────────────
    if (records.length > 0) {
      sheet.addRow([]);

      // Per-employee summary
      const byEmployee: Record<
        string,
        {
          name: string;
          present: number;
          halfDay: number;
          absent: number;
          totalHours: number;
        }
      > = {};
      for (const rec of records) {
        const id = rec.user_id;
        if (!byEmployee[id]) {
          byEmployee[id] = {
            name: rec.userName ?? "—",
            present: 0,
            halfDay: 0,
            absent: 0,
            totalHours: 0,
          };
        }
        if (rec.status === "PRESENT") byEmployee[id].present++;
        if (rec.status === "HALF_DAY") byEmployee[id].halfDay++;
        if (rec.status === "ABSENT") byEmployee[id].absent++;
        byEmployee[id].totalHours += parseFloat(String(rec.total_hours ?? 0));
      }

      const summaryHeaderRow = sheet.addRow([
        "",
        "Employee Summary",
        "",
        "Present",
        "Half Day",
        "Absent",
        "Total Hours",
        "",
      ]);
      summaryHeaderRow.height = 22;
      summaryHeaderRow.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col >= 2 && col <= 7) {
          cell.font = {
            name: "Calibri",
            bold: true,
            size: 10,
            color: { argb: "FFFFFFFF" },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF2B5797" },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      });

      let summaryIdx = 0;
      for (const emp of Object.values(byEmployee)) {
        summaryIdx++;
        const sRow = sheet.addRow([
          "",
          emp.name,
          "",
          emp.present,
          emp.halfDay,
          emp.absent,
          `${emp.totalHours.toFixed(2)}h`,
          "",
        ]);
        sRow.height = 18;
        sRow.eachCell({ includeEmpty: true }, (cell, col) => {
          cell.font = { name: "Calibri", size: 10 };
          cell.alignment = {
            vertical: "middle",
            horizontal: col === 2 ? "left" : "center",
          };
          if (summaryIdx % 2 === 0) {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF7F9FC" },
            };
          }
        });
      }
    }

    // ── Auto-filter on header row ─────────────────────────────────────────────
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: 9 },
    };

    // ── Generate buffer and return ────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();

    const filename = `attendance_${month}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("GET /api/attendance/export:", err);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
