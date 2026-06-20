// app/api/tasks/stats/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTaskStats } from "@/lib/tasks/service";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pass team_type from session so getTaskStats can correctly
  // scope tasks for team leaders (uses team_type, not team_leader_id)
  const stats = await getTaskStats(
    session.user.id,
    session.user.role,
    session.user.team_type ?? null,
  );

  return NextResponse.json(stats);
}
