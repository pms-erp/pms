// app/api/attendance/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, users } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

// GET /api/attendance/history
// Returns ALL attendance records (no date range filter) with same RBAC as /api/attendance
// ADMIN          → all staff (or filtered by ?userId=)
// TEAM_LEADER    → own + team members
// Others         → own only
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sessionUserId, role } = session.user;
    const { searchParams } = new URL(req.url);
    const requestedUserId = searchParams.get("userId");

    let userIdFilter: string[] | null = null;

    if (role === "ADMIN") {
      if (requestedUserId) userIdFilter = [requestedUserId];
      else userIdFilter = null; // null = no filter = all staff
    } else if (role === "TEAM_LEADER") {
      if (requestedUserId) {
        // Viewing a specific user — only allow own userId
        userIdFilter = [sessionUserId];
      } else {
        // No filter = show own + team members
        const teamLeaderUser = await db
          .select({ team_type: users.team_type })
          .from(users)
          .where(eq(users.id, sessionUserId))
          .then((r) => r[0] ?? null);

        if (teamLeaderUser?.team_type) {
          const teamMemberRows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.team_type, teamLeaderUser.team_type));
          const teamIds = teamMemberRows.map((u) => u.id);
          userIdFilter = [...new Set([sessionUserId, ...teamIds])];
        } else {
          userIdFilter = [sessionUserId];
        }
      }
    } else {
      // Non-admin: always own records only, ignore any userId param
      userIdFilter = [sessionUserId];
    }

    const filters = [];
    if (userIdFilter !== null) {
      if (userIdFilter.length === 1) {
        filters.push(eq(attendance.user_id, userIdFilter[0]));
      } else {
        filters.push(inArray(attendance.user_id, userIdFilter));
      }
    }

    const whereCondition = filters.length > 0 ? and(...filters) : undefined;

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
        created_at: attendance.created_at,
        userName: users.name,
        userAvatar: users.avatar,
        userRole: users.role,
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.user_id, users.id))
      .where(whereCondition)
      .orderBy(desc(attendance.date), desc(attendance.check_in));

    const serialized = records.map((r) => ({
      ...r,
      date:
        r.date instanceof Date ? r.date.toISOString().split("T")[0] : r.date,
      check_in:
        r.check_in instanceof Date ? r.check_in.toISOString() : r.check_in,
      check_out:
        r.check_out instanceof Date
          ? r.check_out.toISOString()
          : (r.check_out ?? null),
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : r.created_at,
      total_hours: r.total_hours != null ? String(r.total_hours) : null,
    }));

    return NextResponse.json({ records: serialized });
  } catch (err) {
    console.error("GET /api/attendance/history:", err);
    return NextResponse.json(
      { error: "Failed to fetch attendance history" },
      { status: 500 },
    );
  }
}
