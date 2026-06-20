// app/api/devices/[id]/assign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { devices, deviceAssignments } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const CAN_MANAGE = ["ADMIN", "PROJECT_MANAGER"];

type Context = { params: Promise<{ id: string }> };

// POST /api/devices/[id]/assign
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!CAN_MANAGE.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: deviceId } = await params;
    const { userId, notes } = (await req.json()) as {
      userId: string;
      notes?: string;
    };

    if (!userId)
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );

    // Check device exists and is available
    const device = await db
      .select({ id: devices.id, status: devices.status })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .then((r) => r[0]);

    if (!device)
      return NextResponse.json({ error: "Device not found" }, { status: 404 });

    if (device.status === "ASSIGNED") {
      return NextResponse.json(
        { error: "Device is already assigned to someone" },
        { status: 409 },
      );
    }

    if (device.status === "RETIRED") {
      return NextResponse.json(
        { error: "Cannot assign a retired device" },
        { status: 409 },
      );
    }

    // Create assignment
    const assignmentId = uuid();
    await db.insert(deviceAssignments).values({
      id: assignmentId,
      device_id: deviceId,
      user_id: userId,
      assigned_by: session.user.id,
      assigned_at: new Date(),
      notes: notes ?? null,
    });

    // Update device status to ASSIGNED
    await db
      .update(devices)
      .set({ status: "ASSIGNED", updated_at: new Date() })
      .where(eq(devices.id, deviceId));

    return NextResponse.json({ success: true, assignmentId });
  } catch (err) {
    console.error("POST /api/devices/[id]/assign:", err);
    return NextResponse.json(
      { error: "Failed to assign device" },
      { status: 500 },
    );
  }
}
