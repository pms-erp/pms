import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projectViewers, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// Only ADMIN / PROJECT_MANAGER can manage viewers
function canManage(role: string) {
  return (
    role === "ADMIN" || role === "PROJECT_MANAGER" || role === "TEAM_LEADER"
  );
}

// GET /api/projects/[id]/viewers
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      avatar: users.avatar,
      role: users.role,
    })
    .from(projectViewers)
    .innerJoin(users, eq(projectViewers.user_id, users.id))
    .where(eq(projectViewers.project_id, projectId));

  return NextResponse.json(rows);
}

// POST /api/projects/[id]/viewers  — body: { userIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: projectId } = await params;
  const { userIds } = (await req.json()) as { userIds: string[] };

  if (!Array.isArray(userIds) || userIds.length === 0)
    return NextResponse.json({ error: "userIds required" }, { status: 400 });

  // ── Team Leader restriction ───────────────────────────────────────────────
  // Team leaders can only add viewers from their own team.
  // Validate server-side so it can't be bypassed via API.
  let allowedUserIds = userIds;

  if (session.user.role === "TEAM_LEADER") {
    // Get team leader's team_type
    const leader = await db
      .select({ team_type: users.team_type })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!leader?.team_type) {
      return NextResponse.json(
        { error: "Your account has no team assigned" },
        { status: 403 },
      );
    }

    // Fetch the team_type of each requested user
    const requestedUsers = await db
      .select({ id: users.id, team_type: users.team_type })
      .from(users)
      .where(inArray(users.id, userIds));

    // Only allow users from the same team
    allowedUserIds = requestedUsers
      .filter((u) => u.team_type === leader.team_type)
      .map((u) => u.id);

    const blocked = userIds.length - allowedUserIds.length;
    if (blocked > 0) {
      // Log but don't hard-fail — just skip the blocked ones
      console.warn(
        `[Viewers] Team leader ${session.user.id} tried to add ${blocked} users from other teams — skipped`,
      );
    }

    if (allowedUserIds.length === 0) {
      return NextResponse.json(
        { error: "You can only add viewers from your own team" },
        { status: 403 },
      );
    }
  }

  // Upsert — skip duplicates
  const existing = await db
    .select({ user_id: projectViewers.user_id })
    .from(projectViewers)
    .where(
      and(
        eq(projectViewers.project_id, projectId),
        inArray(projectViewers.user_id, allowedUserIds),
      ),
    );

  const existingIds = new Set(existing.map((r) => r.user_id));
  const toInsert = allowedUserIds.filter((id) => !existingIds.has(id));

  if (toInsert.length > 0) {
    await db.insert(projectViewers).values(
      toInsert.map((userId) => ({
        id: uuid(),
        project_id: projectId,
        user_id: userId,
        added_by: session.user.id,
      })),
    );
  }

  return NextResponse.json({ success: true, added: toInsert.length });
}

// DELETE /api/projects/[id]/viewers?userId=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: projectId } = await params;
  const userId = new URL(req.url).searchParams.get("userId");

  if (!userId)
    return NextResponse.json({ error: "userId required" }, { status: 400 });

  await db
    .delete(projectViewers)
    .where(
      and(
        eq(projectViewers.project_id, projectId),
        eq(projectViewers.user_id, userId),
      ),
    );

  return NextResponse.json({ success: true });
}
