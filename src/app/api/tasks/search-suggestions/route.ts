import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { tasks, projects } from "@/db/schema";
import { and, like, or, eq, SQL, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Build RBAC filter
    const rbacFilters: SQL[] = [];
    const viewerCondition = sql`${tasks.id} IN (
      SELECT tv.task_id FROM task_viewers tv WHERE tv.user_id = ${session.user.id}
    )` as SQL;
    if (
      session.user.role !== "ADMIN" &&
      session.user.role !== "PROJECT_MANAGER"
    ) {
      rbacFilters.push(
        or(
          eq(tasks.assigned_to, session.user.id),
          eq(tasks.assigned_by, session.user.id),
          eq(tasks.qa_assigned_to, session.user.id),
          viewerCondition,
        ) as SQL,
      );
    }

    // Search filter
    const searchFilter = or(
      like(tasks.title, `%${query}%`),
      like(tasks.description, `%${query}%`),
    );

    // Fetch matching tasks with project info
    const results = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectName: projects.name,
        team_type: tasks.team_type,
        priority: tasks.priority,
        status: tasks.status,
      })
      .from(tasks)
      .leftJoin(projects, eq(tasks.project_id, projects.id))
      .where(and(searchFilter, ...rbacFilters))
      .limit(10);

    return NextResponse.json({
      suggestions: results,
    });
  } catch (error) {
    console.error("Error fetching search suggestions:", error);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 },
    );
  }
}
