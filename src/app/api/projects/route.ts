import { db } from "@/db";
import { projects } from "@/db/schema";
import { sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canCreateProject } from "@/lib/projects/permissions";
import { createProjectSchema } from "@/lib/projects/validation";

// GET - Fetch projects list (RBAC filtered)
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam) : undefined;

    // 🔍 Add search parameter handling
    const search = searchParams.get("search")?.trim() ?? "";

    const { role, id: userId } = session.user;

    const selectFields = {
      id: projects.id,
      name: projects.name,
      client_name: projects.client_name,
      website_url: projects.website_url,
      status: projects.status,
      body: projects.body,
      created_at: projects.created_at,
      // 📊 Add taskCount subquery
      taskCount: sql<number>`(SELECT COUNT(*) FROM tasks WHERE tasks.project_id = ${projects.id})`,
    };

    // Shared subquery — appended to every non-admin role so project viewers
    // always see projects they were explicitly granted access to
    const projectViewerSubquery = sql`
      OR ${projects.id} IN (
        SELECT project_id FROM project_viewers WHERE user_id = ${userId}
      )
    `;

    // 🔍 Reusable search condition
    const searchCondition = search
      ? sql`${projects.name} LIKE ${"%" + search + "%"}`
      : undefined;

    let query;

    if (role === "ADMIN" || role === "PROJECT_MANAGER") {
      // See all projects — with optional search filter
      query = db
        .select(selectFields)
        .from(projects)
        .where(searchCondition)
        .orderBy(desc(projects.created_at));
    } else if (role === "TEAM_LEADER") {
      const teamType = session.user.team_type;
      if (teamType) {
        query = db
          .selectDistinct(selectFields)
          .from(projects)
          .where(
            sql`(
          ${projects.id} IN (
            SELECT t.project_id FROM tasks t
            INNER JOIN users u ON t.assigned_to = u.id
            WHERE u.team_type = ${teamType}
          )
          ${projectViewerSubquery}
        )${searchCondition ? sql` AND ${searchCondition}` : sql``}`,
          )
          .orderBy(desc(projects.created_at));
      } else {
        query = db
          .selectDistinct(selectFields)
          .from(projects)
          .where(
            sql`(
          ${projects.id} IN (
            SELECT project_id FROM tasks WHERE assigned_by = ${userId}
          )
          ${projectViewerSubquery}
        )${searchCondition ? sql` AND ${searchCondition}` : sql``}`,
          )
          .orderBy(desc(projects.created_at));
      }
    } else if (role === "QA") {
      // ✅ QA sees ALL active projects (or all projects if you prefer)
      // Optionally filter by status if needed, e.g., AND ${projects.status} = 'ACTIVE'
      query = db
        .selectDistinct(selectFields)
        .from(projects)
        .where(searchCondition ? sql`${searchCondition}` : undefined)
        .orderBy(desc(projects.created_at));
    } else {
      // Regular members (DEVELOPER, DESIGNER, PROGRAMMER, etc.)
      query = db
        .selectDistinct(selectFields)
        .from(projects)
        .where(
          sql`(
        ${projects.id} IN (
          SELECT project_id FROM tasks
          WHERE assigned_to = ${userId}
          OR assigned_by = ${userId}
          OR id IN (SELECT task_id FROM task_viewers WHERE user_id = ${userId})
        )
        ${projectViewerSubquery}
      )${searchCondition ? sql` AND ${searchCondition}` : sql``}`,
        )
        .orderBy(desc(projects.created_at));
    }

    const allProjects = limit ? await query.limit(limit) : await query;

    return NextResponse.json({ data: allProjects, total: allProjects.length });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 },
    );
  }
}

// POST - Create new project
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canCreateProject(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const id = nanoid();

    await db.insert(projects).values({
      id,
      name: data.name,
      client_name: data.client_name || null,
      website_url: data.website_url || null,
      fiverr_order_id: data.fiverr_order_id || null,
      body: data.body || null,
      files: (body.files as string) || null,
      status: data.status,
      created_by: session.user.id,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}
