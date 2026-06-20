// app/api/devices/[id]/unassign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { devices, deviceAssignments } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const CAN_MANAGE = ["ADMIN", "PROJECT_MANAGER"];

type Context = { params: Promise<{ id: string }> };

// POST /api/devices/[id]/unassign
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!CAN_MANAGE.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: deviceId } = await params;

    // Find the active assignment
    const activeAssignment = await db
      .select({ id: deviceAssignments.id })
      .from(deviceAssignments)
      .where(
        and(
          eq(deviceAssignments.device_id, deviceId),
          isNull(deviceAssignments.returned_at),
        ),
      )
      .then((r) => r[0]);

    if (!activeAssignment) {
      return NextResponse.json(
        { error: "Device is not currently assigned" },
        { status: 409 },
      );
    }

    // Mark as returned
    await db
      .update(deviceAssignments)
      .set({ returned_at: new Date() })
      .where(eq(deviceAssignments.id, activeAssignment.id));

    // Update device status back to AVAILABLE
    await db
      .update(devices)
      .set({ status: "AVAILABLE", updated_at: new Date() })
      .where(eq(devices.id, deviceId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("POST /api/devices/[id]/unassign:", err);
    return NextResponse.json(
      { error: "Failed to unassign device" },
      { status: 500 },
    );
  }
}
