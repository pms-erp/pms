import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { devices, deviceAssignments, users } from "@/db/schema";
import { eq, sql, like, and, desc, isNull, SQL } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const CAN_MANAGE = ["ADMIN"]; // ✅ Only ADMIN can manage devices

const EMPTY_RESPONSE = {
  data: [] as unknown[],
  total: 0,
  page: 1,
  totalPages: 0,
  stats: { total: 0, available: 0, assigned: 0, maintenance: 0, retired: 0 },
};

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status") ?? "";
    const type = searchParams.get("type") ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.min(100, Number(searchParams.get("limit") ?? 20));
    const offset = (page - 1) * limit;

    const { id: userId, role } = session.user;

    // ── Base filters ──────────────────────────────────────────────────────────
    const baseFilters: SQL[] = [];
    if (search) baseFilters.push(like(devices.name, `%${search}%`));
    if (status)
      baseFilters.push(
        eq(
          devices.status,
          status as "AVAILABLE" | "ASSIGNED" | "MAINTENANCE" | "RETIRED",
        ),
      );
    if (type)
      baseFilters.push(
        eq(
          devices.type,
          type as "LAPTOP" | "DESKTOP" | "PHONE" | "TABLET" | "OTHER",
        ),
      );

    // ── Role visibility filter ────────────────────────────────────────────────
    let roleFilter: SQL | undefined = undefined;

    if (role === "ADMIN") {
      // ADMIN sees all devices — no filter
    } else {
      // PROJECT_MANAGER, TEAM_LEADER, DEVELOPER, DESIGNER, PROGRAMMER, QA
      // — only see their own assigned devices
      roleFilter = sql`${devices.id} IN (
        SELECT device_id FROM device_assignments
        WHERE user_id = ${userId} AND returned_at IS NULL
      )`;
    }

    const allFilters: SQL[] = [...baseFilters];
    if (roleFilter) allFilters.push(roleFilter);
    const whereClause = allFilters.length ? and(...allFilters) : undefined;

    // ── Query ─────────────────────────────────────────────────────────────────
    const [data, countResult] = await Promise.all([
      db
        .select({
          id: devices.id,
          name: devices.name,
          type: devices.type,
          brand: devices.brand,
          model: devices.model,
          serial_no: devices.serial_no,
          status: devices.status,
          condition: devices.condition,
          notes: devices.notes,
          has_keyboard: devices.has_keyboard,
          has_mouse: devices.has_mouse,
          has_charger: devices.has_charger,
          has_extended_screen: devices.has_extended_screen,
          password: devices.password,
          created_at: devices.created_at,
          updated_at: devices.updated_at,
          assignedUserName: users.name,
          assignedUserId: deviceAssignments.user_id,
          assignedAt: deviceAssignments.assigned_at,
        })
        .from(devices)
        .leftJoin(
          deviceAssignments,
          and(
            eq(deviceAssignments.device_id, devices.id),
            isNull(deviceAssignments.returned_at),
          ),
        )
        .leftJoin(users, eq(users.id, deviceAssignments.user_id))
        .where(whereClause)
        .orderBy(desc(devices.created_at))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`count(distinct ${devices.id})` })
        .from(devices)
        .where(whereClause),
    ]);

    // ── Stats with same role filter ───────────────────────────────────────────
    const stats = await db
      .select({
        total: sql<number>`count(*)`,
        available: sql<number>`sum(case when ${devices.status} = 'AVAILABLE'   then 1 else 0 end)`,
        assigned: sql<number>`sum(case when ${devices.status} = 'ASSIGNED'    then 1 else 0 end)`,
        maintenance: sql<number>`sum(case when ${devices.status} = 'MAINTENANCE' then 1 else 0 end)`,
        retired: sql<number>`sum(case when ${devices.status} = 'RETIRED'     then 1 else 0 end)`,
      })
      .from(devices)
      .where(roleFilter)
      .then(
        (r) =>
          r[0] ?? {
            total: 0,
            available: 0,
            assigned: 0,
            maintenance: 0,
            retired: 0,
          },
      );

    const total = Number(countResult[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({ data, total, page, totalPages, stats });
  } catch (err) {
    console.error("GET /api/devices:", err);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 },
    );
  }
}

// ── POST — create device ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Only ADMIN can create devices
    if (!CAN_MANAGE.includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      name: string;
      type: string;
      brand: string;
      model: string;
      serial_no: string;
      condition?: string;
      notes?: string;
      has_keyboard?: boolean;
      has_mouse?: boolean;
      has_charger?: boolean;
      has_extended_screen?: boolean;
      password?: string;
    };

    const {
      name,
      type,
      brand,
      model,
      serial_no,
      condition = "GOOD",
      notes,
      has_keyboard = false,
      has_mouse = false,
      has_charger = false,
      has_extended_screen = false,
      password,
    } = body;

    if (!name || !type || !brand || !model || !serial_no)
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );

    const id = uuid();
    await db.insert(devices).values({
      id,
      name,
      brand,
      model,
      serial_no,
      type: type as "LAPTOP" | "DESKTOP" | "PHONE" | "TABLET" | "OTHER",
      condition: condition as "NEW" | "GOOD" | "FAIR" | "POOR",
      has_keyboard: has_keyboard === true,
      has_mouse: has_mouse === true,
      has_charger: has_charger === true,
      has_extended_screen: has_extended_screen === true,
      password: password ?? null,
      notes: notes ?? null,
      status: "AVAILABLE",
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate entry"))
      return NextResponse.json(
        { error: "Serial number already exists" },
        { status: 409 },
      );
    console.error("POST /api/devices:", err);
    return NextResponse.json(
      { error: "Failed to create device" },
      { status: 500 },
    );
  }
}

// ── PATCH — update device ─────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Only ADMIN can update devices
    if (!CAN_MANAGE.includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "Device ID required" },
        { status: 400 },
      );

    const body = (await req.json()) as Partial<{
      name: string;
      type: string;
      brand: string;
      model: string;
      serial_no: string;
      status: string;
      condition: string;
      notes: string;
      has_keyboard: boolean;
      has_mouse: boolean;
      has_charger: boolean;
      has_extended_screen: boolean;
      password: string;
    }>;

    const updateData: Partial<typeof devices.$inferInsert> & {
      updated_at?: Date;
    } = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined)
      updateData.type = body.type as
        | "LAPTOP"
        | "DESKTOP"
        | "PHONE"
        | "TABLET"
        | "OTHER";
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.serial_no !== undefined) updateData.serial_no = body.serial_no;
    if (body.status !== undefined)
      updateData.status = body.status as
        | "AVAILABLE"
        | "ASSIGNED"
        | "MAINTENANCE"
        | "RETIRED";
    if (body.condition !== undefined)
      updateData.condition = body.condition as "NEW" | "GOOD" | "FAIR" | "POOR";
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.has_keyboard !== undefined)
      updateData.has_keyboard = body.has_keyboard;
    if (body.has_mouse !== undefined) updateData.has_mouse = body.has_mouse;
    if (body.has_charger !== undefined)
      updateData.has_charger = body.has_charger;
    if (body.has_extended_screen !== undefined)
      updateData.has_extended_screen = body.has_extended_screen;
    if (body.password !== undefined)
      updateData.password = body.password || null;

    if (Object.keys(updateData).length === 0)
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );

    updateData.updated_at = new Date();

    await db.update(devices).set(updateData).where(eq(devices.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/devices:", err);
    return NextResponse.json(
      { error: "Failed to update device" },
      { status: 500 },
    );
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ✅ Only ADMIN can delete devices
    if (!CAN_MANAGE.includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json(
        { error: "Device ID required" },
        { status: 400 },
      );

    await db.delete(devices).where(eq(devices.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/devices:", err);
    return NextResponse.json(
      { error: "Failed to delete device" },
      { status: 500 },
    );
  }
}
