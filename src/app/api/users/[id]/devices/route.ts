import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { devices, deviceAssignments } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const assigned = await db
      .select({
        id: devices.id,
        name: devices.name,
        type: devices.type,
        brand: devices.brand,
        model: devices.model,
        serial_no: devices.serial_no,
        status: devices.status,
        condition: devices.condition,
        assigned_at: deviceAssignments.assigned_at,
      })
      .from(deviceAssignments)
      .innerJoin(devices, eq(deviceAssignments.device_id, devices.id))
      .where(
        and(
          eq(deviceAssignments.user_id, id),
          isNull(deviceAssignments.returned_at),
        ),
      );

    return NextResponse.json({ devices: assigned });
  } catch (err) {
    console.error("GET /api/users/[id]/devices:", err);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 },
    );
  }
}
