// src/app/api/client/project-notes/[noteId]/route.ts
// PATCH — toggle is_client_visible on a task note

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { taskNotes } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["ADMIN", "PROJECT_MANAGER"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { noteId } = await params;

  let body: { is_client_visible?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.is_client_visible !== "boolean")
    return NextResponse.json(
      { error: "is_client_visible must be a boolean" },
      { status: 400 },
    );

  await db
    .update(taskNotes)
    .set({ is_client_visible: body.is_client_visible })
    .where(eq(taskNotes.id, noteId));

  return NextResponse.json({ success: true });
}
