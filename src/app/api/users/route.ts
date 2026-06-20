// app/api/users/route.ts

import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, attendanceLocations } from "@/db/schema";
import { hash } from "bcryptjs";
import { v4 as uuid } from "uuid";
import { eq, like, and } from "drizzle-orm";
import { syncSopsToUser } from "@/lib/assignment-sync"; // ← NEW

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const role = searchParams.get("role");
  const activeParam = searchParams.get("active");
  const forAssignment = searchParams.get("for") === "assignment";
  const teamOf = searchParams.get("teamOf");
  const teamLeaderId = searchParams.get("teamLeaderId");
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);
  const offset = (page - 1) * limit;

  const { role: sessionRole } = session.user;

  type WhereFilter = Parameters<typeof and>[0];
  const filters: WhereFilter[] = [];

  if (teamOf ?? teamLeaderId) {
    if (sessionRole !== "ADMIN" && session.user.id !== (teamOf ?? teamLeaderId))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const leaderRow = await db
      .select({ team_type: users.team_type })
      .from(users)
      .where(eq(users.id, (teamOf ?? teamLeaderId)!))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!leaderRow?.team_type) return NextResponse.json({ users: [] });

    const teamMembers = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        avatar: users.avatar,
        role: users.role,
        level: users.level,
        team_type: users.team_type,
        is_active: users.is_active,
      })
      .from(users)
      .where(
        and(
          eq(users.team_type, leaderRow.team_type),
          eq(users.is_active, true),
        ),
      );

    return NextResponse.json({ users: teamMembers });
  }

  if (forAssignment) {
    if (sessionRole === "ADMIN" || sessionRole === "PROJECT_MANAGER") {
      filters.push(eq(users.is_active, true));
    } else if (sessionRole === "TEAM_LEADER") {
      const teamType = session.user.team_type ?? null;
      if (teamType) {
        filters.push(eq(users.team_type, teamType));
        filters.push(eq(users.is_active, true));
      } else {
        return NextResponse.json([]);
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (activeParam === "true") filters.push(eq(users.is_active, true));
  if (activeParam === "false") filters.push(eq(users.is_active, false));
  if (search) filters.push(like(users.username, `%${search}%`));
  if (role) filters.push(eq(users.role, role));

  const whereCondition = filters.length > 0 ? and(...filters) : undefined;

  const data = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      avatar: users.avatar,
      role: users.role,
      level: users.level,
      team_type: users.team_type,
      team_leader_id: users.team_leader_id,
      location_id: users.location_id,
      is_active: users.is_active,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(whereCondition)
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ users: data });
}

// ── POST — Create new user ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  let body: {
    name?: string;
    username?: string;
    email?: string;
    password?: string;
    role?: string;
    level?: string | null;
    team_type?: string | null;
    base_salary?: string | number | null;
    join_date?: string | null;
    per_minute_rate?: string | number | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_account_title?: string | null;
    location_id?: string | null;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    username,
    email,
    password,
    role,
    level,
    team_type,
    base_salary,
    join_date,
    per_minute_rate,
    bank_name,
    bank_account_number,
    bank_account_title,
    location_id,
  } = body;

  if (!name || name.trim().length < 2)
    return NextResponse.json(
      { error: "Name must be at least 2 characters" },
      { status: 400 },
    );
  if (!username || username.trim().length < 3)
    return NextResponse.json(
      { error: "Username must be at least 3 characters" },
      { status: 400 },
    );
  if (!password || password.length < 6)
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 },
    );
  if (!role)
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  if (role === "TEAM_LEADER" && !team_type)
    return NextResponse.json(
      { error: "Team Leader must be assigned to a team" },
      { status: 400 },
    );

  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username.trim()))
    .limit(1);
  if (existingUsername.length > 0)
    return NextResponse.json(
      { error: "Username already exists" },
      { status: 400 },
    );

  const emailTrimmed = email?.trim() ?? "";
  if (emailTrimmed) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed))
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, emailTrimmed))
      .limit(1);
    if (existingEmail.length > 0)
      return NextResponse.json(
        { error: "Email already in use" },
        { status: 400 },
      );
  }

  const validLevels = ["JUNIOR", "SENIOR"];
  const validatedLevel = level && validLevels.includes(level) ? level : null;

  const canManageLocations =
    session.user.role === "ADMIN" || session.user.role === "PROJECT_MANAGER";
  let validatedLocationId: string | null = null;

  if (canManageLocations && location_id && location_id !== "none") {
    const loc = await db
      .select({ id: attendanceLocations.id })
      .from(attendanceLocations)
      .where(
        and(
          eq(attendanceLocations.id, location_id),
          eq(attendanceLocations.is_active, true),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!loc)
      return NextResponse.json(
        { error: "Invalid location selected" },
        { status: 400 },
      );
    validatedLocationId = location_id;
  }

  function parseDecimal(
    value: string | number | null | undefined,
  ): string | null | undefined {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return isNaN(num) || !isFinite(num) ? null : num.toString();
  }
  function parseJoinDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  function parseStr(value: string | null | undefined): string | null {
    if (!value) return null;
    const t = value.trim();
    return t === "" ? null : t;
  }

  const newId = uuid();
  const hashedPassword = await hash(password, 10);

  const insertData = {
    id: newId,
    name: name.trim(),
    username: username.trim(),
    email: emailTrimmed || null,
    avatar: null as string | null,
    password: hashedPassword,
    password_plain: password,
    role,
    level: validatedLevel,
    team_type: parseStr(team_type),
    team_leader_id: null as string | null,
    base_salary:
      session.user.role === "ADMIN" ? parseDecimal(base_salary) : null,
    per_minute_rate:
      session.user.role === "ADMIN" ? parseDecimal(per_minute_rate) : null,
    bank_name: session.user.role === "ADMIN" ? parseStr(bank_name) : null,
    bank_account_number:
      session.user.role === "ADMIN" ? parseStr(bank_account_number) : null,
    bank_account_title:
      session.user.role === "ADMIN" ? parseStr(bank_account_title) : null,
    location_id: canManageLocations ? validatedLocationId : null,
    join_date: parseJoinDate(join_date ?? null),
    is_active: true,
  };

  try {
    if (role === "TEAM_LEADER" && insertData.team_type) {
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ team_leader_id: null })
          .where(eq(users.team_type, insertData.team_type!));
        await tx.insert(users).values({ ...insertData, team_leader_id: newId });
      });
    } else {
      await db.insert(users).values(insertData);
    }

    // ── Assign all existing SOPs to the new user (fire-and-forget) ───────────
    // KPIs and Checklists are NOT assigned here — the new user has no team
    // history yet. They will get KPIs/Checklists when admin assigns a team.
    syncSopsToUser(newId).catch((err) =>
      console.error(`[assignment-sync] new user SOP sync ${newId}:`, err),
    );

    return NextResponse.json({ success: true, userId: newId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Create user error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Duplicate entry"))
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );
  }
}
