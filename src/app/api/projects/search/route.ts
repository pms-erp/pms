// src/app/api/projects/search/route.ts
// GET /api/projects/search?q=xxx
// Used by lead-detail-sheet link-project picker

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageLeads } from "@/lib/rbac";
import { searchProjectsForLinking } from "@/lib/leads/lead-project-service";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canManageLeads(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const projects = await searchProjectsForLinking(q);
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("GET /api/projects/search error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
