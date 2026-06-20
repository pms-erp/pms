// src/app/api/client/projects/route.ts
// GET — returns all projects linked to the logged-in CLIENT user

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { clientProjects, projects, tasks } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "CLIENT")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientId = session.user.id;

  // Fetch all projects linked to this client, with task stats
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      client_name: projects.client_name,
      website_url: projects.website_url,
      status: projects.status,
      body: projects.body,
      created_at: projects.created_at,
      // Task completion stats via subqueries
      total_tasks: sql<number>`(
        SELECT COUNT(*) FROM tasks WHERE tasks.project_id = ${projects.id}
      )`,
      approved_tasks: sql<number>`(
        SELECT COUNT(*) FROM tasks
        WHERE tasks.project_id = ${projects.id} AND tasks.status = 'APPROVED'
      )`,
    })
    .from(clientProjects)
    .innerJoin(projects, eq(clientProjects.project_id, projects.id))
    .where(eq(clientProjects.client_id, clientId))
    .orderBy(projects.created_at);

  // Calculate completion percentage
  const data = rows.map((r) => ({
    ...r,
    completion_percent:
      Number(r.total_tasks) > 0
        ? Math.round((Number(r.approved_tasks) / Number(r.total_tasks)) * 100)
        : 0,
  }));

  return NextResponse.json({ data });
}
