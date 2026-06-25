// src/app/api/portfolio/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { portfolio } from "@/db/schema";
import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { hasPermission } from "@/lib/rbac";

// ── GET /api/portfolio ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "VIEW_PORTFOLIO")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const source = searchParams.get("source") ?? "";
  const projectType = searchParams.get("project_type") ?? "";
  const websiteBuilder = searchParams.get("website_builder") ?? "";
  const status = searchParams.get("status") ?? "";
  const isPublic = searchParams.get("is_public") ?? "";
  const isFavorite = searchParams.get("is_favorite") ?? ""; // ← NEW
  const dateFrom = searchParams.get("date_from") ?? "";
  const dateTo = searchParams.get("date_to") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];

  if (search) {
    conditions.push(
      or(
        like(portfolio.project_name, `%${search}%`),
        like(portfolio.customer_name, `%${search}%`),
        like(portfolio.business_name, `%${search}%`),
        like(portfolio.project_id, `%${search}%`),
      ) as ReturnType<typeof eq>,
    );
  }

  if (source)
    conditions.push(
      eq(portfolio.source, source as typeof portfolio.source._.data),
    );
  if (projectType)
    conditions.push(
      eq(
        portfolio.project_type,
        projectType as typeof portfolio.project_type._.data,
      ),
    );
  if (websiteBuilder)
    conditions.push(
      eq(
        portfolio.website_builder,
        websiteBuilder as typeof portfolio.website_builder._.data,
      ),
    );
  if (status)
    conditions.push(
      eq(portfolio.status, status as typeof portfolio.status._.data),
    );
  if (isPublic !== "")
    conditions.push(eq(portfolio.is_public, isPublic === "true"));
  if (isFavorite !== "")
    // ← NEW
    conditions.push(eq(portfolio.is_favorite, isFavorite === "true"));
  if (dateFrom)
    conditions.push(gte(portfolio.project_date, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(portfolio.project_date, new Date(dateTo)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(portfolio)
      .where(where)
      .orderBy(
        sql`COALESCE(${portfolio.project_date}, ${portfolio.created_at}) DESC`,
      )
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)` })
      .from(portfolio)
      .where(where),
  ]);

  return NextResponse.json({ data: rows, total, page, limit });
}

// ── POST /api/portfolio ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, "CREATE_PORTFOLIO")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const {
    project_date,
    project_id,
    linked_project_id,
    project_name,
    customer_name,
    business_name,
    email,
    phone,
    source,
    project_type,
    website_builder,
    status,
    website_url,
    figma_url,
    short_description,
    featured_image,
    gallery_images,
    pdf_documents,
    is_public,
  } = body;

  if (!project_name || !source) {
    return NextResponse.json(
      { error: "project_name and source are required" },
      { status: 400 },
    );
  }

  const now = new Date();
  const id = uuidv4();

  await db.insert(portfolio).values({
    id,
    project_date: project_date ? new Date(project_date) : null,
    project_id: project_id || null,
    linked_project_id: linked_project_id || null,
    project_name,
    customer_name: customer_name || null,
    business_name: business_name || null,
    email: email || null,
    phone: phone || null,
    source,
    project_type: project_type || null,
    website_builder: website_builder || null,
    status: status ?? "DRAFT",
    website_url: website_url || null,
    figma_url: figma_url || null,
    short_description: short_description || null,
    featured_image: featured_image || null,
    gallery_images: gallery_images ?? [],
    pdf_documents: pdf_documents ?? [],
    is_public: is_public ?? false,
    is_favorite: false, // ← NEW: always false on creation
    created_by: session.user.id,
    created_at: now,
    updated_at: now,
  });

  const [created] = await db
    .select()
    .from(portfolio)
    .where(eq(portfolio.id, id));
  return NextResponse.json(created, { status: 201 });
}
