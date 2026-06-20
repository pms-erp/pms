// app/api/sops/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { sops, userSops, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const ALLOWED_ROLES = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"];
function canManage(role: string) {
  return ALLOWED_ROLES.includes(role);
}

/** Returns all active user IDs that a TEAM_LEADER is allowed to assign to.
 *  Uses team_type match — the reliable relationship. */
async function getTeamMemberIds(leaderId: string): Promise<string[]> {
  const leader = await db
    .select({ team_type: users.team_type })
    .from(users)
    .where(eq(users.id, leaderId))
    .then((r) => r[0] ?? null);

  if (!leader?.team_type) {
    // Fallback: team_leader_id relationship
    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.team_leader_id, leaderId), eq(users.is_active, true)),
      );
    return members.map((u) => u.id);
  }

  const members = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(eq(users.team_type, leader.team_type), eq(users.is_active, true)),
    );
  return members.map((u) => u.id);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const forUserId = searchParams.get("userId");

    if (forUserId) {
      const rows = await db
        .select({
          id: sops.id,
          title: sops.title,
          body: sops.body,
          created_at: sops.created_at,
          assignment_id: userSops.id,
          assigned_at: userSops.assigned_at,
        })
        .from(userSops)
        .innerJoin(sops, eq(userSops.sop_id, sops.id))
        .where(eq(userSops.user_id, forUserId));
      return NextResponse.json({ sops: rows });
    }

    const allSops = await db
      .select({
        id: sops.id,
        title: sops.title,
        body: sops.body,
        created_at: sops.created_at,
        updated_at: sops.updated_at,
        created_by: sops.created_by,
      })
      .from(sops)
      .orderBy(sops.created_at);

    return NextResponse.json({ sops: allSops });
  } catch (err) {
    console.error("GET /api/sops:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !canManage(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.title?.trim() || !body.body?.trim())
      return NextResponse.json(
        { error: "title and body are required" },
        { status: 400 },
      );

    const id = uuid();
    await db.insert(sops).values({
      id,
      title: body.title.trim(),
      body: body.body.trim(),
      created_by: session.user.id,
    });

    // NO auto-assign — assignment is done explicitly via PATCH

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/sops:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !canManage(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    // ── Assign to users ────────────────────────────────────────────────────
    if (
      body.assignUserIds !== undefined ||
      body.unassignUserIds !== undefined
    ) {
      const assignUserIds: string[] = Array.isArray(body.assignUserIds)
        ? body.assignUserIds
        : [];
      const unassignUserIds: string[] = Array.isArray(body.unassignUserIds)
        ? body.unassignUserIds
        : [];

      if (session.user.role === "TEAM_LEADER") {
        const allowedIds = await getTeamMemberIds(session.user.id);
        const allowedSet = new Set(allowedIds);
        const unauthorized = assignUserIds.filter((id) => !allowedSet.has(id));
        if (unauthorized.length > 0)
          return NextResponse.json(
            { error: "You can only assign to your own team members" },
            { status: 403 },
          );
      }

      if (assignUserIds.length > 0) {
        const existing = await db
          .select({ user_id: userSops.user_id })
          .from(userSops)
          .where(eq(userSops.sop_id, body.id));
        const existingIds = new Set(existing.map((e) => e.user_id));
        const toInsert = assignUserIds.filter((id) => !existingIds.has(id));

        if (toInsert.length > 0) {
          await db.insert(userSops).values(
            toInsert.map((userId) => ({
              id: uuid(),
              user_id: userId,
              sop_id: body.id,
              assigned_by: session.user.id,
            })),
          );
        }
      }

      if (unassignUserIds.length > 0) {
        await db
          .delete(userSops)
          .where(
            and(
              eq(userSops.sop_id, body.id),
              inArray(userSops.user_id, unassignUserIds),
            ),
          );
      }

      return NextResponse.json({ success: true });
    }

    // ── Update content ─────────────────────────────────────────────────────
    await db
      .update(sops)
      .set({
        title: body.title?.trim(),
        body: body.body?.trim(),
        updated_at: new Date(),
      })
      .where(eq(sops.id, body.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/sops:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !canManage(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(sops).where(eq(sops.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/sops:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
