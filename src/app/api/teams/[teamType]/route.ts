// app/api/teams/[teamType]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, teams } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ── GET — fetch one team's members ────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ teamType: string }> },
) {
  const { teamType } = await context.params;
  const slug = teamType.toUpperCase();

  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const team = await db
    .select()
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      team_type: users.team_type,
      team_leader_id: users.team_leader_id,
      avatar: users.avatar,
    })
    .from(users)
    .where(and(eq(users.team_type, slug), eq(users.is_active, true)));

  const leaderId = members.find((m) =>
    members.some((other) => other.team_leader_id === m.id),
  )?.id;

  return NextResponse.json({
    team_type: slug,
    team_name: team.name,
    leader: members.find((m) => m.id === leaderId) ?? null,
    members: members.filter((m) => m.id !== leaderId),
    total: members.length,
  });
}

// ── PATCH — rename a team (display name only, slug is immutable) ──────────────
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ teamType: string }> },
) {
  const { teamType } = await context.params;
  const slug = teamType.toUpperCase();

  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json(
      { error: "Name must be at least 2 characters" },
      { status: 400 },
    );
  }

  const team = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  await db.update(teams).set({ name: name.trim() }).where(eq(teams.slug, slug));

  return NextResponse.json({ success: true, slug, name: name.trim() });
}

// ── DELETE — remove a team, unassign all its members ─────────────────────────
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ teamType: string }> },
) {
  const { teamType } = await context.params;
  const slug = teamType.toUpperCase();

  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const team = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  // Unassign all members first (set team_type + team_leader_id to null)
  await db
    .update(users)
    .set({ team_type: null, team_leader_id: null })
    .where(eq(users.team_type, slug));

  // Delete the team
  await db.delete(teams).where(eq(teams.slug, slug));

  return NextResponse.json({ success: true });
}
