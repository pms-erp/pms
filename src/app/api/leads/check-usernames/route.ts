// ─── API: /api/leads/check-usernames ─────────────────────────────────────────
// POST - Check which Fiverr usernames already exist in leads table
// src/app/api/leads/check-usernames/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { usernames } = await req.json();
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return NextResponse.json({ existing: [] });
  }

  const existing = await db
    .select({ username: leads.username })
    .from(leads)
    .where(inArray(leads.username, usernames));

  return NextResponse.json({
    existing: existing.map((e) => e.username).filter(Boolean),
  });
}
