// app/api/asana/workspaces/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const ASANA_BASE = "https://app.asana.com/api/1.0";

async function asanaGet(path: string, token: string) {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { errors?: { message: string }[] }).errors?.[0]?.message ??
        `Asana API error ${res.status}`,
    );
  }
  return res.json();
}

// GET /api/asana/workspaces?token=xxx
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = req.nextUrl.searchParams.get("token");
  if (!token)
    return NextResponse.json(
      { error: "Asana token required" },
      { status: 400 },
    );

  try {
    const data = await asanaGet("/workspaces?opt_fields=gid,name", token);
    return NextResponse.json({ workspaces: data.data ?? [] });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch workspaces",
      },
      { status: 500 },
    );
  }
}
