// app/api/users/[id]/team/route.ts — Fully Updated
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, teams } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await getServerSession(authOptions);

  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // REPLACE WITH:
  let body: { team_type?: string | null; is_leader?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { team_type, is_leader } = body;

  // Validate team exists if team_type is provided
  if (team_type && typeof team_type === "string") {
    const team = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.slug, team_type.trim()))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 400 });
    }
  }

  try {
    const teamTypeClean =
      team_type && typeof team_type === "string" ? team_type.trim() : null;

    const updateData: {
      team_type: string | null;
      team_leader_id?: string | null;
    } = {
      team_type: teamTypeClean,
      team_leader_id: null, // always clear leader when changing team
    };

    await db.transaction(async (tx) => {
      // If assigning to a team and making them leader
      if (teamTypeClean && is_leader === true) {
        // Remove leader from all others in this team first
        await tx
          .update(users)
          .set({ team_leader_id: null })
          .where(eq(users.team_type, teamTypeClean));

        // Update user with team + self-referencing leader ID
        await tx
          .update(users)
          .set({ ...updateData, team_leader_id: id })
          .where(eq(users.id, id));
      } else {
        // Just update team assignment (clear leader)
        await tx.update(users).set(updateData).where(eq(users.id, id));
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update team error:", error);
    return NextResponse.json(
      { error: "Failed to update team" },
      { status: 500 },
    );
  }
}
