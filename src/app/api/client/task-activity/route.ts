// app/api/client/task-activity/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { clientProjects, tasks } from "@/db/schema";
import { eq, inArray, and, gte, sql } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // 1. Get all project IDs this client is linked to via client_projects
  const linkedProjects = await db
    .select({ projectId: clientProjects.project_id })
    .from(clientProjects)
    .where(eq(clientProjects.client_id, userId));

  const projectIds = linkedProjects.map((p) => p.projectId);

  if (projectIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // 2. Calculate cutoff date (90 days ago)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  cutoff.setHours(0, 0, 0, 0);

  // 3. Fetch all tasks for those projects created in the last 90 days
  const allTasks = await db
    .select({
      createdAt: tasks.created_at,
      status: tasks.status,
    })
    .from(tasks)
    .where(
      and(inArray(tasks.project_id, projectIds), gte(tasks.created_at, cutoff)),
    );

  // 4. Group by date in JS (database-agnostic, no raw SQL needed)
  const grouped: Record<string, { created: number; approved: number }> = {};

  // Pre-fill last 90 days with zeros so the chart has continuous data
  for (let i = 0; i < 90; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    grouped[key] = { created: 0, approved: 0 };
  }

  for (const task of allTasks) {
    const dateKey = new Date(task.createdAt).toISOString().split("T")[0];
    if (!grouped[dateKey]) {
      grouped[dateKey] = { created: 0, approved: 0 };
    }
    grouped[dateKey].created++;
    if (task.status === "APPROVED") {
      grouped[dateKey].approved++;
    }
  }

  // 5. Convert to sorted array
  const data = Object.entries(grouped)
    .map(([date, counts]) => ({
      date,
      created: counts.created,
      approved: counts.approved,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ data });
}
