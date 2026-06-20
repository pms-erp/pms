// lib/assignment-sync.ts
import { db } from "@/db";
import {
  users,
  sops,
  userSops,
  kpis,
  userKpis,
  kpiTeamAssignments,
  checklists,
  userChecklists,
  checklistTeamAssignments,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";

async function getAdminId(): Promise<string | null> {
  return db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "ADMIN"))
    .limit(1)
    .then((r) => r[0]?.id ?? null);
}

// ── syncUserAssignments ───────────────────────────────────────────────────────
// Called when team_type, level, or is_active changes on a user.
// Uses explicit kpiTeamAssignments / checklistTeamAssignments tables
// as the source of truth — no circular "look at other members" heuristic.
export async function syncUserAssignments(userId: string): Promise<void> {
  const user = await db
    .select({
      id: users.id,
      team_type: users.team_type,
      level: users.level,
      is_active: users.is_active,
    })
    .from(users)
    .where(eq(users.id, userId))
    .then((r) => r[0] ?? null);

  if (!user) return;

  if (!user.is_active) {
    await db.delete(userKpis).where(eq(userKpis.user_id, userId));
    await db.delete(userChecklists).where(eq(userChecklists.user_id, userId));
    return;
  }

  const adminId = await getAdminId();
  const assignedBy = adminId ?? userId;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  if (!user.team_type || !user.level) {
    await db.delete(userKpis).where(eq(userKpis.user_id, userId));
  } else {
    // Which KPIs are explicitly assigned to this user's team?
    const teamKpiRows = await db
      .select({ kpi_id: kpiTeamAssignments.kpi_id })
      .from(kpiTeamAssignments)
      .where(eq(kpiTeamAssignments.team_type, user.team_type));

    const teamKpiIds = teamKpiRows.map((r) => r.kpi_id);

    // Of those, which match this user's level?
    const eligibleKpiIds =
      teamKpiIds.length > 0
        ? await db
            .select({ id: kpis.id })
            .from(kpis)
            .where(
              and(
                inArray(kpis.id, teamKpiIds),
                eq(kpis.level, user.level as "SENIOR" | "JUNIOR"),
              ),
            )
            .then((r) => r.map((k) => k.id))
        : [];

    const currentKpiIds = await db
      .select({ kpi_id: userKpis.kpi_id })
      .from(userKpis)
      .where(eq(userKpis.user_id, userId))
      .then((r) => r.map((k) => k.kpi_id));

    const toAdd = eligibleKpiIds.filter((id) => !currentKpiIds.includes(id));
    const toRemove = currentKpiIds.filter((id) => !eligibleKpiIds.includes(id));

    if (toAdd.length > 0) {
      await db.insert(userKpis).values(
        toAdd.map((kpiId) => ({
          id: uuid(),
          user_id: userId,
          kpi_id: kpiId,
          assigned_by: assignedBy,
        })),
      );
    }
    if (toRemove.length > 0) {
      await db
        .delete(userKpis)
        .where(
          and(eq(userKpis.user_id, userId), inArray(userKpis.kpi_id, toRemove)),
        );
    }
  }

  // ── Checklists ────────────────────────────────────────────────────────────
  if (!user.team_type) {
    await db.delete(userChecklists).where(eq(userChecklists.user_id, userId));
  } else {
    const teamChecklistRows = await db
      .select({ checklist_id: checklistTeamAssignments.checklist_id })
      .from(checklistTeamAssignments)
      .where(eq(checklistTeamAssignments.team_type, user.team_type));

    const eligibleChecklistIds = teamChecklistRows.map((r) => r.checklist_id);

    const currentChecklistIds = await db
      .select({ checklist_id: userChecklists.checklist_id })
      .from(userChecklists)
      .where(eq(userChecklists.user_id, userId))
      .then((r) => r.map((c) => c.checklist_id));

    const toAdd = eligibleChecklistIds.filter(
      (id) => !currentChecklistIds.includes(id),
    );
    const toRemove = currentChecklistIds.filter(
      (id) => !eligibleChecklistIds.includes(id),
    );

    if (toAdd.length > 0) {
      await db.insert(userChecklists).values(
        toAdd.map((checklistId) => ({
          id: uuid(),
          user_id: userId,
          checklist_id: checklistId,
          assigned_by: assignedBy,
        })),
      );
    }
    if (toRemove.length > 0) {
      await db
        .delete(userChecklists)
        .where(
          and(
            eq(userChecklists.user_id, userId),
            inArray(userChecklists.checklist_id, toRemove),
          ),
        );
    }
  }
}

// ── syncSopsToUser ────────────────────────────────────────────────────────────
// Assigns ALL existing SOPs to a single user.
// Call once when a new user is created.
export async function syncSopsToUser(userId: string): Promise<void> {
  const adminId = await getAdminId();
  const assignedBy = adminId ?? userId;

  const allSopIds = await db
    .select({ id: sops.id })
    .from(sops)
    .then((r) => r.map((s) => s.id));

  if (allSopIds.length === 0) return;

  const existingSopIds = await db
    .select({ sop_id: userSops.sop_id })
    .from(userSops)
    .where(eq(userSops.user_id, userId))
    .then((r) => r.map((s) => s.sop_id));

  const toAdd = allSopIds.filter((id) => !existingSopIds.includes(id));
  if (toAdd.length > 0) {
    await db.insert(userSops).values(
      toAdd.map((sopId) => ({
        id: uuid(),
        user_id: userId,
        sop_id: sopId,
        assigned_by: assignedBy,
      })),
    );
  }
}

// ── syncNewSopToAllUsers ──────────────────────────────────────────────────────
// When a new SOP is created, assign it to ALL active users.
export async function syncNewSopToAllUsers(sopId: string): Promise<void> {
  const adminId = await getAdminId();

  const allActiveUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.is_active, true));

  if (allActiveUsers.length === 0) return;

  const existing = await db
    .select({ user_id: userSops.user_id })
    .from(userSops)
    .where(eq(userSops.sop_id, sopId))
    .then((r) => new Set(r.map((s) => s.user_id)));

  const toInsert = allActiveUsers.filter((u) => !existing.has(u.id));
  if (toInsert.length === 0) return;

  await db.insert(userSops).values(
    toInsert.map((u) => ({
      id: uuid(),
      user_id: u.id,
      sop_id: sopId,
      assigned_by: adminId ?? toInsert[0].id,
    })),
  );
}

// ── syncTeamForKpi ────────────────────────────────────────────────────────────
// After assigning/unassigning teams to a KPI, sync userKpis for all
// members of affected teams.
export async function syncTeamForKpi(
  kpiId: string,
  assignTeamTypes: string[],
  unassignTeamTypes: string[],
  assignedBy: string,
): Promise<void> {
  const kpiRow = await db
    .select({ level: kpis.level })
    .from(kpis)
    .where(eq(kpis.id, kpiId))
    .then((r) => r[0] ?? null);

  if (!kpiRow) return;
  const kpiLevel = kpiRow.level;

  // ASSIGN: insert into kpiTeamAssignments + give KPI to matching users
  for (const teamType of assignTeamTypes) {
    // Upsert team assignment record
    const existing = await db
      .select({ id: kpiTeamAssignments.id })
      .from(kpiTeamAssignments)
      .where(
        and(
          eq(kpiTeamAssignments.kpi_id, kpiId),
          eq(kpiTeamAssignments.team_type, teamType),
        ),
      )
      .then((r) => r[0] ?? null);

    if (!existing) {
      await db.insert(kpiTeamAssignments).values({
        id: uuid(),
        kpi_id: kpiId,
        team_type: teamType,
        assigned_by: assignedBy,
      });
    }

    // Give KPI to all level-matching active members of this team
    const members = await db
      .select({ id: users.id, level: users.level })
      .from(users)
      .where(and(eq(users.team_type, teamType), eq(users.is_active, true)));

    const eligible = members
      .filter((m) => m.level === kpiLevel)
      .map((m) => m.id);

    if (eligible.length > 0) {
      const alreadyHave = await db
        .select({ user_id: userKpis.user_id })
        .from(userKpis)
        .where(
          and(eq(userKpis.kpi_id, kpiId), inArray(userKpis.user_id, eligible)),
        )
        .then((r) => new Set(r.map((k) => k.user_id)));

      const toInsert = eligible.filter((uid) => !alreadyHave.has(uid));
      if (toInsert.length > 0) {
        await db.insert(userKpis).values(
          toInsert.map((userId) => ({
            id: uuid(),
            user_id: userId,
            kpi_id: kpiId,
            assigned_by: assignedBy,
          })),
        );
      }
    }
  }

  // UNASSIGN: delete from kpiTeamAssignments + remove KPI from team members
  for (const teamType of unassignTeamTypes) {
    await db
      .delete(kpiTeamAssignments)
      .where(
        and(
          eq(kpiTeamAssignments.kpi_id, kpiId),
          eq(kpiTeamAssignments.team_type, teamType),
        ),
      );

    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.team_type, teamType), eq(users.is_active, true)));

    const memberIds = members.map((m) => m.id);
    if (memberIds.length > 0) {
      await db
        .delete(userKpis)
        .where(
          and(eq(userKpis.kpi_id, kpiId), inArray(userKpis.user_id, memberIds)),
        );
    }
  }
}

// ── syncTeamForChecklist ──────────────────────────────────────────────────────
export async function syncTeamForChecklist(
  checklistId: string,
  assignTeamTypes: string[],
  unassignTeamTypes: string[],
  assignedBy: string,
): Promise<void> {
  // ASSIGN
  for (const teamType of assignTeamTypes) {
    const existing = await db
      .select({ id: checklistTeamAssignments.id })
      .from(checklistTeamAssignments)
      .where(
        and(
          eq(checklistTeamAssignments.checklist_id, checklistId),
          eq(checklistTeamAssignments.team_type, teamType),
        ),
      )
      .then((r) => r[0] ?? null);

    if (!existing) {
      await db.insert(checklistTeamAssignments).values({
        id: uuid(),
        checklist_id: checklistId,
        team_type: teamType,
        assigned_by: assignedBy,
      });
    }

    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.team_type, teamType), eq(users.is_active, true)));

    const memberIds = members.map((m) => m.id);
    if (memberIds.length > 0) {
      const alreadyHave = await db
        .select({ user_id: userChecklists.user_id })
        .from(userChecklists)
        .where(
          and(
            eq(userChecklists.checklist_id, checklistId),
            inArray(userChecklists.user_id, memberIds),
          ),
        )
        .then((r) => new Set(r.map((c) => c.user_id)));

      const toInsert = memberIds.filter((uid) => !alreadyHave.has(uid));
      if (toInsert.length > 0) {
        await db.insert(userChecklists).values(
          toInsert.map((userId) => ({
            id: uuid(),
            user_id: userId,
            checklist_id: checklistId,
            assigned_by: assignedBy,
          })),
        );
      }
    }
  }

  // UNASSIGN
  for (const teamType of unassignTeamTypes) {
    await db
      .delete(checklistTeamAssignments)
      .where(
        and(
          eq(checklistTeamAssignments.checklist_id, checklistId),
          eq(checklistTeamAssignments.team_type, teamType),
        ),
      );

    const members = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.team_type, teamType), eq(users.is_active, true)));

    const memberIds = members.map((m) => m.id);
    if (memberIds.length > 0) {
      await db
        .delete(userChecklists)
        .where(
          and(
            eq(userChecklists.checklist_id, checklistId),
            inArray(userChecklists.user_id, memberIds),
          ),
        );
    }
  }
}

// ── syncAllAssignments ────────────────────────────────────────────────────────
// Run once via POST /api/admin/sync-assignments to fix stale data.
export async function syncAllAssignments(): Promise<void> {
  const allActive = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.is_active, true));

  for (const u of allActive) {
    await syncSopsToUser(u.id);
  }
  for (const u of allActive) {
    await syncUserAssignments(u.id);
  }
}
