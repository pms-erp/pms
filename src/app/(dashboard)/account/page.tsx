// app/(dashboard)/account/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  users,
  devices,
  deviceAssignments,
  sops,
  userSops,
  kpis,
  userKpis,
  kpiTeamAssignments,
  checklists,
  userChecklists,
  checklistTeamAssignments,
} from "@/db/schema";
import { eq, and, isNull, ne } from "drizzle-orm";
import { AccountClient } from "./_components/account-client";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id: sessionUserId, role } = session.user;
  const canManage = ["ADMIN", "PROJECT_MANAGER", "TEAM_LEADER"].includes(role);

  // ── 1. Current user ────────────────────────────────────────────────────────
  const user = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      team_type: users.team_type,
      level: users.level,
      avatar: users.avatar,
      base_salary: users.base_salary,
      join_date: users.join_date,
      per_minute_rate: users.per_minute_rate,
      bank_name: users.bank_name,
      bank_account_number: users.bank_account_number,
      bank_account_title: users.bank_account_title,
    })
    .from(users)
    .where(eq(users.id, sessionUserId))
    .then((r) => r[0] ?? null);

  if (!user) redirect("/login");

  // ── 2. Assigned devices ────────────────────────────────────────────────────
  const assignedDevices = await db
    .select({
      id: devices.id,
      name: devices.name,
      type: devices.type,
      brand: devices.brand,
      model: devices.model,
      serial_no: devices.serial_no,
      status: devices.status,
      condition: devices.condition,
      has_keyboard: devices.has_keyboard,
      has_extended_screen: devices.has_extended_screen,
      has_mouse: devices.has_mouse,
      has_charger: devices.has_charger,
      password: devices.password,
      notes: devices.notes,
      created_at: devices.created_at,
      updated_at: devices.updated_at,
    })
    .from(devices)
    .innerJoin(deviceAssignments, eq(deviceAssignments.device_id, devices.id))
    .where(
      and(
        eq(deviceAssignments.user_id, user.id),
        isNull(deviceAssignments.returned_at),
      ),
    );

  // ── 3. Assignable users ────────────────────────────────────────────────────
  // ADMIN / PROJECT_MANAGER → all active users except themselves
  // TEAM_LEADER             → all active users who share the same team_type
  //                           (excludes the leader themselves)
  let assignableUsers: {
    id: string;
    name: string;
    role: string;
    team_type: string | null;
    level: string | null;
  }[] = [];

  if (canManage) {
    if (role === "TEAM_LEADER") {
      // Fetch all active users in the same team as this leader (excludes self)
      if (user.team_type) {
        assignableUsers = await db
          .select({
            id: users.id,
            name: users.name,
            role: users.role,
            team_type: users.team_type,
            level: users.level,
          })
          .from(users)
          .where(
            and(
              eq(users.team_type, user.team_type),
              eq(users.is_active, true),
              ne(users.id, sessionUserId),
            ),
          );
      } else {
        // Leader has no team_type — fall back to team_leader_id relationship
        assignableUsers = await db
          .select({
            id: users.id,
            name: users.name,
            role: users.role,
            team_type: users.team_type,
            level: users.level,
          })
          .from(users)
          .where(
            and(
              eq(users.team_leader_id, sessionUserId),
              eq(users.is_active, true),
            ),
          );
      }
    } else {
      // ADMIN or PROJECT_MANAGER — all active users except themselves
      assignableUsers = await db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          team_type: users.team_type,
          level: users.level,
        })
        .from(users)
        .where(and(eq(users.is_active, true), ne(users.id, sessionUserId)));
    }
  }

  // ── 4. SOPs ────────────────────────────────────────────────────────────────
  const allSops = canManage
    ? await db
        .select({
          id: sops.id,
          title: sops.title,
          body: sops.body,
          created_at: sops.created_at,
          updated_at: sops.updated_at,
        })
        .from(sops)
        .orderBy(sops.created_at)
    : [];

  const sopAssignments = canManage
    ? await db
        .select({ sop_id: userSops.sop_id, user_id: userSops.user_id })
        .from(userSops)
    : [];

  // ── 5. KPIs ────────────────────────────────────────────────────────────────
  const allKpis = canManage
    ? await db
        .select({
          id: kpis.id,
          title: kpis.title,
          body: kpis.body,
          level: kpis.level,
          created_at: kpis.created_at,
          updated_at: kpis.updated_at,
        })
        .from(kpis)
        .orderBy(kpis.created_at)
    : [];

  const kpiAssignments = canManage
    ? await db
        .select({ kpi_id: userKpis.kpi_id, user_id: userKpis.user_id })
        .from(userKpis)
    : [];

  const kpiTeamRows = canManage
    ? await db
        .select({
          kpi_id: kpiTeamAssignments.kpi_id,
          team_type: kpiTeamAssignments.team_type,
        })
        .from(kpiTeamAssignments)
    : [];

  // ── 6. Checklists ──────────────────────────────────────────────────────────
  const allChecklists = canManage
    ? await db
        .select({
          id: checklists.id,
          title: checklists.title,
          body: checklists.body,
          created_at: checklists.created_at,
          updated_at: checklists.updated_at,
        })
        .from(checklists)
        .orderBy(checklists.created_at)
    : [];

  const checklistAssignments = canManage
    ? await db
        .select({
          checklist_id: userChecklists.checklist_id,
          user_id: userChecklists.user_id,
        })
        .from(userChecklists)
    : [];

  const checklistTeamRows = canManage
    ? await db
        .select({
          checklist_id: checklistTeamAssignments.checklist_id,
          team_type: checklistTeamAssignments.team_type,
        })
        .from(checklistTeamAssignments)
    : [];

  // ── 7. My own assigned items ───────────────────────────────────────────────
  const myAssignedSops = await db
    .select({
      id: sops.id,
      title: sops.title,
      body: sops.body,
      assigned_at: userSops.assigned_at,
    })
    .from(userSops)
    .innerJoin(sops, eq(userSops.sop_id, sops.id))
    .where(eq(userSops.user_id, sessionUserId));

  const myAssignedKpisRaw = await db
    .select({
      id: kpis.id,
      title: kpis.title,
      body: kpis.body,
      level: kpis.level,
      assigned_at: userKpis.assigned_at,
    })
    .from(userKpis)
    .innerJoin(kpis, eq(userKpis.kpi_id, kpis.id))
    .where(eq(userKpis.user_id, sessionUserId));

  const myAssignedKpis = user.level
    ? myAssignedKpisRaw.filter((k) => k.level === user.level)
    : myAssignedKpisRaw;

  const myAssignedChecklists = await db
    .select({
      id: checklists.id,
      title: checklists.title,
      body: checklists.body,
      assigned_at: userChecklists.assigned_at,
    })
    .from(userChecklists)
    .innerJoin(checklists, eq(userChecklists.checklist_id, checklists.id))
    .where(eq(userChecklists.user_id, sessionUserId));

  function ts(d: Date | string | null | undefined): string {
    if (!d) return new Date().toISOString();
    return d instanceof Date ? d.toISOString() : String(d);
  }

  return (
    <AccountClient
      user={{
        ...user,
        level: user.level ?? null,
        base_salary: user.base_salary ? String(user.base_salary) : null,
        per_minute_rate: user.per_minute_rate
          ? String(user.per_minute_rate)
          : null,
        join_date:
          user.join_date instanceof Date
            ? user.join_date.toISOString().split("T")[0]
            : (user.join_date ?? null),
      }}
      assignedDevices={assignedDevices}
      canManage={canManage}
      assignableUsers={assignableUsers}
      allSops={allSops.map((s) => ({
        ...s,
        created_at: ts(s.created_at),
        updated_at: ts(s.updated_at),
        assignedUserIds: sopAssignments
          .filter((a) => a.sop_id === s.id)
          .map((a) => a.user_id),
      }))}
      allKpis={allKpis.map((k) => ({
        ...k,
        created_at: ts(k.created_at),
        updated_at: ts(k.updated_at),
        assignedUserIds: kpiAssignments
          .filter((a) => a.kpi_id === k.id)
          .map((a) => a.user_id),
        assignedTeamTypes: kpiTeamRows
          .filter((r) => r.kpi_id === k.id)
          .map((r) => r.team_type),
      }))}
      allChecklists={allChecklists.map((c) => ({
        ...c,
        created_at: ts(c.created_at),
        updated_at: ts(c.updated_at),
        assignedUserIds: checklistAssignments
          .filter((a) => a.checklist_id === c.id)
          .map((a) => a.user_id),
        assignedTeamTypes: checklistTeamRows
          .filter((r) => r.checklist_id === c.id)
          .map((r) => r.team_type),
      }))}
      myAssignedSops={myAssignedSops.map((s) => ({
        ...s,
        assigned_at: ts(s.assigned_at),
      }))}
      myAssignedKpis={myAssignedKpis.map((k) => ({
        ...k,
        assigned_at: ts(k.assigned_at),
      }))}
      myAssignedChecklists={myAssignedChecklists.map((c) => ({
        ...c,
        assigned_at: ts(c.assigned_at),
      }))}
    />
  );
}
