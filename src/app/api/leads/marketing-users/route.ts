// src/app/api/leads/marketing-users/route.ts
// Returns all active users who belong to a marketing context —
// used to populate the "Filter by user" dropdown on the leads page.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { canViewLeads, isMarketingContext } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Fetch all active users and then filter in JS using isMarketingContext,
    // so it uses the exact same logic as the rest of the RBAC system.
    // (MySQL doesn't know about our JS marketing heuristic.)
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        avatar: users.avatar,
        role: users.role,
        team_type: users.team_type,
      })
      .from(users)
      .where(eq(users.is_active, true));

    // ADMIN + PM see all marketing users.
    // Marketing members see their own team members only.
    const filtered = allUsers.filter((u) =>
      isMarketingContext(u.role, u.team_type),
    );

    return NextResponse.json({ users: filtered });
  } catch (err) {
    console.error("GET /api/leads/marketing-users error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
