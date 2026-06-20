// app/api/users/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, tasks, projects } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { hash } from "bcryptjs";
import { syncUserAssignments } from "@/lib/assignment-sync";

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);

  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRow = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      level: users.level,
      team_type: users.team_type,
      team_leader_id: users.team_leader_id,
      is_active: users.is_active,
      created_at: users.created_at,
      updated_at: users.updated_at,
      base_salary: users.base_salary,
      join_date: users.join_date,
      per_minute_rate: users.per_minute_rate,
      bank_name: users.bank_name,
      bank_account_number: users.bank_account_number,
      bank_account_title: users.bank_account_title,
      location_id: users.location_id,
      password_plain: users.password_plain,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!userRow)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const canSeePassword = ["ADMIN", "PROJECT_MANAGER"].includes(
    session.user.role,
  );
  const responseUser = canSeePassword
    ? userRow
    : { ...userRow, password_plain: null };

  const userTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      team_type: tasks.team_type,
      estimated_minutes: tasks.estimated_minutes,
      created_at: tasks.created_at,
      project_id: tasks.project_id,
      project_name: projects.name,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.project_id, projects.id))
    .where(eq(tasks.assigned_to, id))
    .orderBy(tasks.created_at);

  const projectIds = Array.from(
    new Set(userTasks.map((t) => t.project_id).filter(Boolean)),
  ) as string[];

  let userProjects: {
    id: string;
    name: string;
    status: string;
    task_count: number;
  }[] = [];
  if (projectIds.length > 0) {
    const projectRows = await db
      .select({ id: projects.id, name: projects.name, status: projects.status })
      .from(projects)
      .where(or(...projectIds.map((pid) => eq(projects.id, pid))));

    userProjects = projectRows.map((p) => ({
      ...p,
      task_count: userTasks.filter((t) => t.project_id === p.id).length,
    }));
  }

  const stats = {
    total: userTasks.length,
    in_progress: userTasks.filter((t) => t.status === "IN_PROGRESS").length,
    waiting_qa: userTasks.filter((t) => t.status === "WAITING_FOR_QA").length,
    approved: userTasks.filter((t) => t.status === "APPROVED").length,
    rework: userTasks.filter((t) => t.status === "REWORK").length,
  };

  return NextResponse.json({
    user: responseUser,
    tasks: userTasks,
    projects: userProjects,
    stats,
  });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);

    if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const currentUser = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!currentUser)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ── Snapshot DB values BEFORE any changes ─────────────────────────────────
    const prevTeamType: string | null = currentUser.team_type ?? null;
    const prevLevel: string | null = currentUser.level ?? null;

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

    // RBAC
    if (session.user.role === "PROJECT_MANAGER") {
      const sensitiveChanges: Record<string, unknown> = {};
      if (base_salary !== undefined && base_salary !== currentUser.base_salary)
        sensitiveChanges.base_salary = base_salary;
      if (
        per_minute_rate !== undefined &&
        per_minute_rate !== currentUser.per_minute_rate
      )
        sensitiveChanges.per_minute_rate = per_minute_rate;
      if (bank_name !== undefined && bank_name !== currentUser.bank_name)
        sensitiveChanges.bank_name = bank_name;
      if (
        bank_account_number !== undefined &&
        bank_account_number !== currentUser.bank_account_number
      )
        sensitiveChanges.bank_account_number = bank_account_number;
      if (
        bank_account_title !== undefined &&
        bank_account_title !== currentUser.bank_account_title
      )
        sensitiveChanges.bank_account_title = bank_account_title;

      if (Object.keys(sensitiveChanges).length > 0)
        return NextResponse.json(
          { error: "You cannot update sensitive financial information" },
          { status: 403 },
        );
      if (
        role &&
        ["ADMIN", "PROJECT_MANAGER"].includes(role) &&
        role !== currentUser.role
      )
        return NextResponse.json(
          { error: "You cannot assign this role" },
          { status: 403 },
        );
    }

    // Validation
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
    if (!role)
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    if (role === "TEAM_LEADER" && !team_type)
      return NextResponse.json(
        { error: "Team Leader must have team type" },
        { status: 400 },
      );

    const validLevels = ["JUNIOR", "SENIOR"];
    const validatedLevel =
      level !== undefined
        ? level && validLevels.includes(level)
          ? level
          : null
        : undefined;

    // Unique checks
    const existingUsername = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username.trim()))
      .limit(1);
    if (existingUsername.length > 0 && existingUsername[0].id !== id)
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
      if (existingEmail.length > 0 && existingEmail[0].id !== id)
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 },
        );
    }

    function parseDecimal(
      value: string | number | null | undefined,
    ): string | null | undefined {
      if (value === undefined) return undefined;
      if (value === null || value === "") return null;
      const num = Number(value);
      return isNaN(num) || !isFinite(num) ? null : num.toString();
    }
    function parseJoinDate(
      value: string | null | undefined,
    ): Date | null | undefined {
      if (value === undefined) return undefined;
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    function parseStr(
      value: string | null | undefined,
    ): string | null | undefined {
      if (value === undefined) return undefined;
      if (!value) return null;
      const t = value.trim();
      return t === "" ? null : t;
    }

    type UpdateUser = Partial<typeof users.$inferInsert>;

    const updateData: UpdateUser = {
      name: name.trim(),
      username: username.trim(),
      email: emailTrimmed || null,
      role,
      ...(validatedLevel !== undefined ? { level: validatedLevel } : {}),
      ...(["ADMIN", "PROJECT_MANAGER"].includes(role)
        ? { team_type: null }
        : team_type
          ? { team_type: team_type.trim() }
          : {}),
      base_salary: parseDecimal(base_salary),
      join_date: parseJoinDate(join_date),
      per_minute_rate: parseDecimal(per_minute_rate),
      bank_name: parseStr(bank_name),
      bank_account_number: parseStr(bank_account_number),
      bank_account_title: parseStr(bank_account_title),
      ...(location_id !== undefined
        ? { location_id: location_id || null }
        : {}),
    };

    if (password && password.trim().length >= 6) {
      updateData.password = await hash(password, 10);
      updateData.password_plain = password;
    }

    (Object.keys(updateData) as (keyof typeof updateData)[]).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    // ── Save ──────────────────────────────────────────────────────────────────
    if (role === "TEAM_LEADER" && updateData.team_type) {
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ team_leader_id: null })
          .where(eq(users.team_type, updateData.team_type!));
        await tx
          .update(users)
          .set({ ...updateData, team_leader_id: id })
          .where(eq(users.id, id));
      });
    } else {
      if (updateData.team_type === null) updateData.team_leader_id = null;
      await db.update(users).set(updateData).where(eq(users.id, id));
    }

    // ── Read back ACTUAL saved values to compare ──────────────────────────────
    // This is the only reliable comparison — no normalization guesswork.
    const savedUser = await db
      .select({ team_type: users.team_type, level: users.level })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((r) => r[0] ?? null);

    const newTeamType: string | null = savedUser?.team_type ?? null;
    const newLevel: string | null = savedUser?.level ?? null;

    const teamTypeChanged = newTeamType !== prevTeamType;
    const levelChanged = newLevel !== prevLevel;

    // ── ONLY sync when team_type or level actually changed ────────────────────
    // This prevents touching other users' assignments on unrelated edits.
    if (teamTypeChanged || levelChanged) {
      console.log(
        `[assignment-sync] user=${id} team: ${prevTeamType}→${newTeamType} level: ${prevLevel}→${newLevel}`,
      );
      // Await so response reflects correct state
      await syncUserAssignments(id).catch((err) =>
        console.error(`[assignment-sync] PATCH user ${id}:`, err),
      );
    }

    // ── Return updated user ───────────────────────────────────────────────────
    const updatedUser = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        email: users.email,
        role: users.role,
        level: users.level,
        team_type: users.team_type,
        team_leader_id: users.team_leader_id,
        is_active: users.is_active,
        created_at: users.created_at,
        updated_at: users.updated_at,
        base_salary: users.base_salary,
        join_date: users.join_date,
        per_minute_rate: users.per_minute_rate,
        bank_name: users.bank_name,
        bank_account_number: users.bank_account_number,
        bank_account_title: users.bank_account_title,
        location_id: users.location_id,
        password_plain: users.password_plain,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((r) => r[0] ?? null);

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error: unknown) {
    console.error("Update user error:", error);
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("Duplicate entry"))
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}

// ── DELETE — Toggle active status ─────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const session = await getServerSession(authOptions);

    if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const existing = await db
      .select({ id: users.id, is_active: users.is_active })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (existing.length === 0)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const newState = !existing[0].is_active;
    await db.update(users).set({ is_active: newState }).where(eq(users.id, id));

    // Only sync KPIs/Checklists on deactivation — never wipe SOPs
    syncUserAssignments(id).catch((err) =>
      console.error(`[assignment-sync] toggle-active user ${id}:`, err),
    );

    return NextResponse.json({ success: true, is_active: newState });
  } catch (error: unknown) {
    console.error("Toggle active error:", error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
