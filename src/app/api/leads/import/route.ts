// src/app/api/leads/import/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { v4 as uuidv4 } from "uuid";

type IncomingLead = {
  username: string;
  client_name: string;
  profile_url: string;
  message_preview: string | null;
  is_pro_client: boolean;
  sent_by: string;
};

type LeadInsert = typeof leads.$inferInsert;

function isIncomingLead(value: unknown): value is IncomingLead {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.username === "string";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await req.json();

  if (
    typeof body !== "object" ||
    body === null ||
    !("leads" in body) ||
    !Array.isArray((body as Record<string, unknown>).leads)
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const raw = (body as { leads: unknown[] }).leads;
  const incomingLeads = raw.filter(isIncomingLead);

  if (incomingLeads.length === 0) {
    return NextResponse.json({ error: "No leads provided" }, { status: 400 });
  }

  const usernames = incomingLeads.map((l) => l.username).filter(Boolean);

  const existingSet = new Set<string>();

  if (usernames.length > 0) {
    const existingRows = await db
      .select({ username: leads.username })
      .from(leads)
      .where(inArray(leads.username, usernames));

    existingRows.forEach((r) => {
      if (r.username) existingSet.add(r.username);
    });
  }

  const toInsert = incomingLeads.filter(
    (l) => l.username && !existingSet.has(l.username),
  );

  const skipped = incomingLeads.length - toInsert.length;
  let imported = 0;

  if (toInsert.length > 0) {
    const now = new Date();

    const rows: LeadInsert[] = toInsert.map((l) => ({
      id: uuidv4(),
      platform: "FIVERR" as const,
      client_name: l.client_name || l.username,
      username: l.username,
      profile_url: l.profile_url ?? `https://www.fiverr.com/${l.username}`,
      requirements: l.message_preview ?? null,
      status: "NEW" as const,
      priority: "MEDIUM" as const,
      sent_by: l.sent_by || session.user.id,
      date_received: now,
      notes: l.is_pro_client ? "Fiverr Pro Client" : null,
      created_at: now,
      updated_at: now,
    }));

    await db.insert(leads).values(rows);
    imported = rows.length;
  }

  return NextResponse.json({ imported, skipped });
}
