import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { devices, deviceAssignments, users } from "@/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";

const CAN_MANAGE = ["ADMIN"]; // ✅ Only ADMIN can manage devices
type Context = { params: Promise<{ id: string }> };

// ── GET — device detail + assignment history ──────────────────────────────────
export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { role, id: userId } = session.user;

    const device = await db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .then((r) => r[0] ?? null);

    if (!device)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ✅ RBAC: PROJECT_MANAGER can only view their own assigned devices
    if (role !== "ADMIN") {
      const isAssigned = await db
        .select({ id: deviceAssignments.id })
        .from(deviceAssignments)
        .where(
          and(
            eq(deviceAssignments.device_id, id),
            eq(deviceAssignments.user_id, userId),
            isNull(deviceAssignments.returned_at),
          ),
        )
        .then((r) => r[0] ?? null);

      if (!isAssigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

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

    return NextResponse.json({ device, history, current });
  } catch (err) {
    console.error("GET /api/devices/[id]:", err);
    return NextResponse.json(
      { error: "Failed to fetch device" },
      { status: 500 },
    );
  }
}

// ── PATCH — update device info ────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Only ADMIN can update devices
    if (!CAN_MANAGE.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const stringFields = [
      "name",
      "type",
      "brand",
      "model",
      "serial_no",
      "status",
      "condition",
      "password",
      "notes",
    ];
    const booleanFields = [
      "has_keyboard",
      "has_mouse",
      "has_charger",
      "has_extended_screen",
    ];

    const update: Record<string, unknown> = {};

    for (const key of stringFields) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    for (const key of booleanFields) {
      if (body[key] !== undefined) update[key] = body[key] === true;
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await db
      .update(devices)
      .set({ ...update, updated_at: new Date() })
      .where(eq(devices.id, id));

    const updated = await db
      .select()
      .from(devices)
      .where(eq(devices.id, id))
      .then((r) => r[0]);

    return NextResponse.json({ success: true, device: updated });
  } catch (err) {
    console.error("PATCH /api/devices/[id]:", err);
    return NextResponse.json(
      { error: "Failed to update device" },
      { status: 500 },
    );
  }
}

// ── DELETE — delete device ────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Only ADMIN can delete devices
    if (!CAN_MANAGE.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const device = await db
      .select({ id: devices.id })
      .from(devices)
      .where(eq(devices.id, id))
      .then((r) => r[0]);

    if (!device)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db
      .delete(deviceAssignments)
      .where(eq(deviceAssignments.device_id, id));
    await db.delete(devices).where(eq(devices.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/devices/[id]:", err);
    return NextResponse.json(
      { error: "Failed to delete device" },
      { status: 500 },
    );
  }
}
