import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendanceLocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// app/api/attendance/locations/route.ts

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 🔑 Fetch ALL locations (not just active) so admin can manage inactive ones
    const locations = await db
      .select()
      .from(attendanceLocations)
      .orderBy(attendanceLocations.created_at); // Optional: sort by newest

    return NextResponse.json({ locations }); // ✅ Must return { locations: [...] }
  } catch (err) {
    console.error("GET /api/attendance/locations:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST — create a new allowed location (ADMIN only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      name: string;
      latitude: number;
      longitude: number;
      radius_meters?: number;
    };

    if (!body.name || body.latitude == null || body.longitude == null)
      return NextResponse.json(
        { error: "name, latitude, longitude are required" },
        { status: 400 },
      );

    const id = uuid();
    await db.insert(attendanceLocations).values({
      id,
      name: body.name.trim(),
      latitude: String(body.latitude),
      longitude: String(body.longitude),
      radius_meters: body.radius_meters ?? 100,
      is_active: true,
      created_by: session.user.id,
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/attendance/locations:", err);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

// PATCH — update or toggle active (ADMIN only)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      id: string;
      name?: string;
      latitude?: number;
      longitude?: number;
      radius_meters?: number;
      is_active?: boolean;
    };

    if (!body.id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.latitude !== undefined) update.latitude = String(body.latitude);
    if (body.longitude !== undefined) update.longitude = String(body.longitude);
    if (body.radius_meters !== undefined)
      update.radius_meters = body.radius_meters;
    if (body.is_active !== undefined) update.is_active = body.is_active;

    await db
      .update(attendanceLocations)
      .set(update)
      .where(eq(attendanceLocations.id, body.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/attendance/locations:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE — hard delete (ADMIN only)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(attendanceLocations).where(eq(attendanceLocations.id, id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/attendance/locations:", err);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
