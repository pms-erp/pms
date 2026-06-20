import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { devices, deviceAssignments, users } from "@/db/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { DeviceDetail } from "./_components/device-detail";

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Fetch device
  const device = await db
    .select()
    .from(devices)
    .where(eq(devices.id, id))
    .then((r) => r[0] ?? null);

  if (!device) notFound();

  // ✅ RBAC: PROJECT_MANAGER can only view their own assigned devices
  if (session.user.role !== "ADMIN") {
    const isAssigned = await db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(
        and(
          eq(deviceAssignments.device_id, id),
          eq(deviceAssignments.user_id, session.user.id),
          isNull(deviceAssignments.returned_at),
        ),
      )
      .then((r) => r[0] ?? null);

    if (!isAssigned) {
      redirect("/devices");
    }
  }

  // Fetch assignment history with user info
  const history = await db
    .select({
      id: deviceAssignments.id,
      user_id: deviceAssignments.user_id,
      assigned_by: deviceAssignments.assigned_by,
      assigned_at: deviceAssignments.assigned_at,
      returned_at: deviceAssignments.returned_at,
      notes: deviceAssignments.notes,
      userName: users.name,
      userUsername: users.username,
      userAvatar: users.avatar,
    })
    .from(deviceAssignments)
    .leftJoin(users, eq(deviceAssignments.user_id, users.id))
    .where(eq(deviceAssignments.device_id, id))
    .orderBy(desc(deviceAssignments.assigned_at));

  const current = history.find((h) => !h.returned_at) ?? null;

  // ✅ Only ADMIN can manage; PROJECT_MANAGER is view-only
  const canManage = session.user.role === "ADMIN";

  // ADMIN, TEAM_LEADER always see password. The assigned user also sees password of their own device.
  const canSeePassword =
    ["ADMIN", "TEAM_LEADER"].includes(session.user.role) ||
    current?.user_id === session.user.id;

  // Normalize dates to strings for client component
  const normalizedDevice = {
    ...device,
    created_at:
      device.created_at instanceof Date
        ? device.created_at.toISOString()
        : String(device.created_at),
    updated_at:
      device.updated_at instanceof Date
        ? device.updated_at.toISOString()
        : String(device.updated_at),
    has_keyboard: device.has_keyboard ?? false,
    has_mouse: device.has_mouse ?? false,
    has_charger: device.has_charger ?? false,
    has_extended_screen: device.has_extended_screen ?? false,
    password: device.password ?? null,
    notes: device.notes ?? null,
    assignedUserName: current?.userName ?? null,
    assignedUserId: current?.user_id ?? null,
    assignedAt:
      current?.assigned_at instanceof Date
        ? current.assigned_at.toISOString()
        : (current?.assigned_at ?? null),
  };

  const normalizedHistory = history.map((h) => ({
    ...h,
    assigned_at:
      h.assigned_at instanceof Date
        ? h.assigned_at.toISOString()
        : h.assigned_at,
    returned_at:
      h.returned_at instanceof Date
        ? h.returned_at.toISOString()
        : (h.returned_at ?? null),
  }));

  const normalizedCurrent = current
    ? {
        ...current,
        assigned_at:
          current.assigned_at instanceof Date
            ? current.assigned_at.toISOString()
            : current.assigned_at,
        returned_at: null,
      }
    : null;

  return (
    <DeviceDetail
      device={normalizedDevice}
      history={normalizedHistory}
      current={normalizedCurrent}
      canManage={canManage}
      canSeePassword={canSeePassword}
      userId={session.user.id}
    />
  );
}
