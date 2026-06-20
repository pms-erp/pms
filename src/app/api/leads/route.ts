// src/app/api/leads/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { leads, leadFollowups, users, leadActivityLogs } from "@/db/schema";
import {
  desc,
  eq,
  and,
  inArray,
  sql,
  type InferSelectModel,
} from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { canViewLeads, canManageLeads, isMarketingContext } from "@/lib/rbac";

type LeadPlatform = InferSelectModel<typeof leads>["platform"];
type LeadStatus = InferSelectModel<typeof leads>["status"];

// ── Helper: insert an activity log row ────────────────────────────────────────
async function logActivity(params: {
  lead_id: string;
  action:
    | "CREATED"
    | "UPDATED"
    | "STATUS_CHANGED"
    | "FOLLOWUP_ADDED"
    | "FOLLOWUP_DELETED";
  summary: string;
  changes?: Record<string, unknown>;
  performed_by: string;
  performed_by_name: string;
}) {
  await db.insert(leadActivityLogs).values({
    id: uuidv4(),
    lead_id: params.lead_id,
    action: params.action,
    summary: params.summary,
    changes: params.changes ? JSON.stringify(params.changes) : null,
    performed_by: params.performed_by,
    performed_by_name: params.performed_by_name,
  });
}

// ── GET /api/leads ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const sentBy = searchParams.get("sent_by");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = (page - 1) * limit;

  try {
    const conditions = [];

    const isMarketing = isMarketingContext(role, team_type);
    if (!canManageLeads(role) && !isMarketing) {
      conditions.push(eq(leads.sent_by, session.user.id));
    }

    if (sentBy) {
      conditions.push(eq(leads.sent_by, sentBy));
    }

    if (platform) conditions.push(eq(leads.platform, platform as LeadPlatform));
    if (status) conditions.push(eq(leads.status, status as LeadStatus));
    if (search) {
      conditions.push(
        sql`(${leads.client_name} LIKE ${`%${search}%`} OR ${leads.project_title} LIKE ${`%${search}%`} OR ${leads.username} LIKE ${`%${search}%`})`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: leads.id,
          platform: leads.platform,
          client_name: leads.client_name,
          username: leads.username,
          country: leads.country,
          project_title: leads.project_title,
          service_category: leads.service_category,
          status: leads.status,
          priority: leads.priority,
          budget: leads.budget,
          proposed_quote: leads.proposed_quote,
          deal_value: leads.deal_value,
          date_received: leads.date_received,
          follow_up_date: leads.follow_up_date,
          next_follow_up_date: leads.next_follow_up_date,
          sent_by: leads.sent_by,
          sent_by_name: users.name,
          created_at: leads.created_at,
        })
        .from(leads)
        .leftJoin(users, eq(leads.sent_by, users.id))
        .where(whereClause)
        .orderBy(desc(leads.created_at))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(whereClause),
    ]);

    const leadIds = rows.map((r) => r.id);
    const followupCounts: Record<string, number> = {};
    if (leadIds.length > 0) {
      const fcRows = await db
        .select({
          lead_id: leadFollowups.lead_id,
          count: sql<number>`COUNT(*)`,
        })
        .from(leadFollowups)
        .where(inArray(leadFollowups.lead_id, leadIds))
        .groupBy(leadFollowups.lead_id);
      fcRows.forEach((r) => {
        followupCounts[r.lead_id] = Number(r.count);
      });
    }

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        total_followups: followupCounts[r.id] ?? 0,
      })),
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error("GET /api/leads error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ── POST /api/leads ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const team_type = session.user.team_type ?? null;

  if (!canViewLeads(role, team_type)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      platform,
      client_name,
      username,
      email,
      phone,
      country,
      profile_url,
      date_received,
      project_title,
      requirements,
      challenges,
      budget,
      estimated_cost,
      proposed_quote,
      expected_timeline,
      service_category,
      status,
      priority,
      assigned_to,
      follow_up_date,
      next_follow_up_date,
      notes,
      platform_data,
    } = body;

    if (!platform || !client_name || !date_received) {
      return NextResponse.json(
        { error: "platform, client_name, and date_received are required" },
        { status: 400 },
      );
    }

    const id = uuidv4();
    await db.insert(leads).values({
      id,
      platform,
      client_name,
      username: username || null,
      email: email || null,
      phone: phone || null,
      country: country || null,
      profile_url: profile_url || null,
      date_received,
      project_title: project_title || null,
      requirements: requirements || null,
      challenges: challenges || null,
      budget: budget ? String(budget) : null,
      estimated_cost: estimated_cost ? String(estimated_cost) : null,
      proposed_quote: proposed_quote ? String(proposed_quote) : null,
      expected_timeline: expected_timeline || null,
      service_category: service_category || null,
      status: status ?? "NEW",
      priority: priority ?? "MEDIUM",
      sent_by: session.user.id,
      assigned_to: assigned_to || null,
      follow_up_date: follow_up_date || null,
      next_follow_up_date: next_follow_up_date || null,
      notes: notes || null,
      platform_data: platform_data ? JSON.stringify(platform_data) : null,
    });

    await logActivity({
      lead_id: id,
      action: "CREATED",
      summary: `Lead created for ${client_name} on ${platform}`,
      performed_by: session.user.id,
      performed_by_name: session.user.name,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/leads error:", err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
