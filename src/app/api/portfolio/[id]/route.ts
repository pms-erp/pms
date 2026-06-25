// src/app/api/portfolio/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { portfolio } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

// ── GET /api/portfolio/[id] ───────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "VIEW_PORTFOLIO"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [item] = await db.select().from(portfolio).where(eq(portfolio.id, id));
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

// ── PATCH /api/portfolio/[id] ─────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "EDIT_PORTFOLIO"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(portfolio)
    .where(eq(portfolio.id, id));
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  await db
    .update(portfolio)
    .set({
      ...(project_date !== undefined && {
        project_date: project_date ? new Date(project_date) : null,
      }),
      ...(project_id !== undefined && { project_id }),
      ...(linked_project_id !== undefined && {
        linked_project_id: linked_project_id || null,
      }),
      ...(project_name !== undefined && { project_name }),
      ...(customer_name !== undefined && { customer_name }),
      ...(business_name !== undefined && { business_name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(source !== undefined && { source }),
      ...(project_type !== undefined && { project_type }),
      ...(website_builder !== undefined && { website_builder }),
      ...(status !== undefined && { status }),
      ...(website_url !== undefined && { website_url }),
      ...(figma_url !== undefined && { figma_url }),
      ...(short_description !== undefined && { short_description }),
      ...(featured_image !== undefined && { featured_image }),
      ...(gallery_images !== undefined && { gallery_images }),
      ...(pdf_documents !== undefined && { pdf_documents }),
      ...(is_public !== undefined && { is_public }),
      updated_at: new Date(),
    })
    .where(eq(portfolio.id, id));

  const [updated] = await db
    .select()
    .from(portfolio)
    .where(eq(portfolio.id, id));
  return NextResponse.json(updated);
}

// ── DELETE /api/portfolio/[id] ────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Params },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "DELETE_PORTFOLIO"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [existing] = await db
    .select()
    .from(portfolio)
    .where(eq(portfolio.id, id));
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(portfolio).where(eq(portfolio.id, id));
  return NextResponse.json({ success: true });
}
