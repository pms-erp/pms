import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { portfolio } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasPermission } from "@/lib/rbac";

type Params = Promise<{ id: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.role, "EDIT_PORTFOLIO"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { is_favorite } = (await req.json()) as { is_favorite: boolean };

  const [existing] = await db
    .select()
    .from(portfolio)
    .where(eq(portfolio.id, id));
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(portfolio)
    .set({ is_favorite, updated_at: new Date() })
    .where(eq(portfolio.id, id));

  return NextResponse.json({ success: true, is_favorite });
}
