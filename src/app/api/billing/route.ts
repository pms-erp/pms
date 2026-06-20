// src/app/api/billing/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { upsertCalendarEvent } from "@/lib/google-calendar";

// ── GET /api/billing ─────────────────────────────────────────────────────────
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await db.select().from(bills).orderBy(desc(bills.due_date));
  return NextResponse.json({ data });
}

// ── POST /api/billing ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const {
    service_name,
    vendor_name,
    category,
    billing_cycle,
    reference_number,
    account_number,
    customer_name,
    login_url,
    login_email,
    amount,
    currency,
    due_date,
    last_paid_date,
    start_date,
    reminder_days_before,
    status,
    notes,
  } = body;

  if (!service_name || !amount || !due_date) {
    return NextResponse.json(
      { error: "service_name, amount, and due_date are required" },
      { status: 400 },
    );
  }

  const id = uuidv4();

  // ── Create Google Calendar event (skip for PAID/CANCELLED) ───────────────
  let calendarEventId: string | null = null;
  if (status !== "CANCELLED" && status !== "PAID") {
    calendarEventId = await upsertCalendarEvent({
      billId: id,
      serviceName: service_name,
      vendorName: vendor_name ?? null,
      customerName: customer_name ?? null,
      accountNumber: account_number ?? null,
      referenceNumber: reference_number ?? null,
      amount: String(amount),
      currency: currency ?? "PKR",
      dueDate: due_date,
      reminderDaysBefore: reminder_days_before ?? 1,
      category: category ?? "OTHER",
      notes: notes ?? null,
    });
  }

  await db.insert(bills).values({
    id,
    service_name,
    vendor_name: vendor_name ?? null,
    category: category ?? "OTHER",
    billing_cycle: billing_cycle ?? "MONTHLY",
    reference_number: reference_number ?? null,
    account_number: account_number ?? null,
    customer_name: customer_name ?? null,
    login_url: login_url ?? null,
    login_email: login_email ?? null,
    amount: String(amount),
    currency: currency ?? "PKR",
    due_date,
    last_paid_date: last_paid_date ?? null,
    start_date: start_date ?? null,
    reminder_days_before: reminder_days_before ?? 1,
    status: status ?? "ACTIVE",
    notes: notes ?? null,
    google_calendar_event_id: calendarEventId,
    created_by: session.user.id,
  });

  return NextResponse.json(
    { success: true, calendar_event_created: !!calendarEventId },
    { status: 201 },
  );
}
