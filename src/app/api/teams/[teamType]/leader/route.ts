// app/api/teams/[teamType]/leader/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, teams } from "@/db/schema";
import { eq, and } from "drizzle-orm";

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

  // Validate team exists in DB
  const team = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const { leader_id } = await req.json();

  try {
    // Remove leader flag from all members of this team first
    await db
      .update(users)
      .set({ team_leader_id: null })
      .where(and(eq(users.team_type, slug), eq(users.is_active, true)));

    if (!leader_id) {
      return NextResponse.json({ success: true, message: "Leader removed" });
    }

    // Verify the new leader belongs to this team
    const newLeader = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(
        and(
          eq(users.id, leader_id),
          eq(users.team_type, slug),
          eq(users.is_active, true),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!newLeader) {
      return NextResponse.json(
        { error: "User not found or not in this team" },
        { status: 400 },
      );
    }

    // Mark the leader (self-referencing: leader's own record gets their own ID)
    await db
      .update(users)
      .set({ team_leader_id: leader_id })
      .where(eq(users.id, leader_id));

    return NextResponse.json({
      success: true,
      message: "Team leader assigned",
      leader: newLeader,
    });
  } catch (error) {
    console.error("Assign leader error:", error);
    return NextResponse.json(
      { error: "Failed to assign team leader" },
      { status: 500 },
    );
  }
}
