// app/api/checklists/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import {
  checklists,
  userChecklists,
  checklistTeamAssignments,
  users,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { syncTeamForChecklist } from "@/lib/assignment-sync";

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
          id: checklists.id,
          title: checklists.title,
          body: checklists.body,
          created_at: checklists.created_at,
          assignment_id: userChecklists.id,
          assigned_at: userChecklists.assigned_at,
        })
        .from(userChecklists)
        .innerJoin(checklists, eq(userChecklists.checklist_id, checklists.id))
        .where(eq(userChecklists.user_id, forUserId));
      return NextResponse.json({ checklists: rows });
    }

    const allChecklists = await db
      .select({
        id: checklists.id,
        title: checklists.title,
        body: checklists.body,
        created_at: checklists.created_at,
        updated_at: checklists.updated_at,
        created_by: checklists.created_by,
      })
      .from(checklists)
      .orderBy(checklists.created_at);

    return NextResponse.json({ checklists: allChecklists });
  } catch (err) {
    console.error("GET /api/checklists:", err);
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
    await db.insert(checklists).values({
      id,
      title: body.title.trim(),
      body: body.body.trim(),
      created_by: session.user.id,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/checklists:", err);
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

    // ── Assign by team type ────────────────────────────────────────────────
    if (
      body.assignTeamTypes !== undefined ||
      body.unassignTeamTypes !== undefined
    ) {
      const assignTeamTypes: string[] = Array.isArray(body.assignTeamTypes)
        ? body.assignTeamTypes
        : [];
      const unassignTeamTypes: string[] = Array.isArray(body.unassignTeamTypes)
        ? body.unassignTeamTypes
        : [];
      const checklistId: string = body.id;

      if (session.user.role === "TEAM_LEADER") {
        const leader = await db
          .select({ team_type: users.team_type })
          .from(users)
          .where(eq(users.id, session.user.id))
          .then((r) => r[0] ?? null);
        const leaderTeam = leader?.team_type ?? null;
        const bad = [...assignTeamTypes, ...unassignTeamTypes].filter(
          (t) => t !== leaderTeam,
        );
        if (bad.length > 0)
          return NextResponse.json(
            { error: "You can only manage your own team" },
            { status: 403 },
          );
      }

      await syncTeamForChecklist(
        checklistId,
        assignTeamTypes,
        unassignTeamTypes,
        session.user.id,
      );
      return NextResponse.json({ success: true });
    }

    // ── Assign individual users ────────────────────────────────────────────
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
          .select({ user_id: userChecklists.user_id })
          .from(userChecklists)
          .where(eq(userChecklists.checklist_id, body.id));
        const existingIds = new Set(existing.map((e) => e.user_id));
        const toInsert = assignUserIds.filter((id) => !existingIds.has(id));

        if (toInsert.length > 0) {
          await db.insert(userChecklists).values(
            toInsert.map((userId) => ({
              id: uuid(),
              user_id: userId,
              checklist_id: body.id,
              assigned_by: session.user.id,
            })),
          );
        }
      }

      if (unassignUserIds.length > 0) {
        await db
          .delete(userChecklists)
          .where(
            and(
              eq(userChecklists.checklist_id, body.id),
              inArray(userChecklists.user_id, unassignUserIds),
            ),
          );
      }

      return NextResponse.json({ success: true });
    }

    // ── Update content ─────────────────────────────────────────────────────
    await db
      .update(checklists)
      .set({
        title: body.title?.trim(),
        body: body.body?.trim(),
        updated_at: new Date(),
      })
      .where(eq(checklists.id, body.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/checklists:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
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

    await db.delete(checklists).where(eq(checklists.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/checklists:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
