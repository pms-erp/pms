// app/api/asana/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ASANA_BASE = "https://app.asana.com/api/1.0";

interface AsanaPage<T> {
  data: T[];
  next_page: { offset: string; path: string } | null;
}

// ── Fetch ALL pages from a paginated Asana endpoint ───────────────────────────
async function asanaGetAll<T>(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = [];
  let offset: string | null = null;

  do {
    const url = new URL(`${ASANA_BASE}${path}`);
    url.searchParams.set("limit", "100");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (offset) url.searchParams.set("offset", offset);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { errors?: { message: string }[] }).errors?.[0]?.message ??
          `Asana API error ${res.status}`,
      );
    }

    const page = (await res.json()) as AsanaPage<T>;
    results.push(...page.data);
    offset = page.next_page?.offset ?? null;
  } while (offset);

  return results;
}

// GET /api/asana/projects?token=xxx&workspace=yyy
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = req.nextUrl.searchParams.get("token");
  const workspace = req.nextUrl.searchParams.get("workspace");

  if (!token || !workspace)
    return NextResponse.json(
      { error: "token and workspace required" },
      { status: 400 },
    );

  try {
    const projects = await asanaGetAll<{
      gid: string;
      name: string;
      notes?: string;
      archived?: boolean;
    }>("/projects", token, {
      workspace: workspace,
      opt_fields: "gid,name,notes,created_at,archived,color",
    });

    return NextResponse.json({ projects, total: projects.length });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch projects",
      },
      { status: 500 },
    );
  }
}
