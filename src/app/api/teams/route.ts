// app/api/teams/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

// GET /api/teams — any authenticated user
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allTeams = await db.select().from(teams).orderBy(teams.created_at);
  return NextResponse.json(allTeams);
}

// POST /api/teams — ADMIN only
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json(
      { error: "Team name must be at least 2 characters" },
      { status: 400 },
    );
  }

  const slug = name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");

  if (!slug) {
    return NextResponse.json({ error: "Invalid team name" }, { status: 400 });
  }

  // Duplicate slug check
  const existing = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: `A team with slug "${slug}" already exists` },
      { status: 400 },
    );
  }

  // ✅ Pre-generate the ID — avoids .$returningId() which is unreliable on MySQL
  const id = uuid();
  const trimmedName = name.trim();

  await db.insert(teams).values({ id, name: trimmedName, slug });

  // Return the created team directly — no second query needed
  return NextResponse.json({ id, name: trimmedName, slug }, { status: 201 });
}

// DELETE /api/teams?slug=DEVELOPER — ADMIN only
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "PROJECT_MANAGER"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  await db.delete(teams).where(eq(teams.slug, slug));

  return NextResponse.json({ success: true });
}
