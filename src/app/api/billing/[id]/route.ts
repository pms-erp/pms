// src/app/api/billing/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  upsertCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/google-calendar";

type Params = { params: Promise<{ id: string }> };

// ── PUT /api/billing/[id] ────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
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

  // Fetch existing bill to get current calendar event id
  const existing = await db
    .select()
    .from(bills)
    .where(eq(bills.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

  let calendarEventId = existing?.google_calendar_event_id ?? null;

  // ── Handle Google Calendar based on new status ────────────────────────────
  if (status === "CANCELLED" || status === "PAID") {
    // Delete calendar event — bill is done
    if (calendarEventId) {
      await deleteCalendarEvent(calendarEventId);
      calendarEventId = null;
    }
  } else {
    // Upsert — create new or update existing event
    calendarEventId = await upsertCalendarEvent(
      {
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
      },
      calendarEventId, // pass existing event id to update instead of create new
    );
  }

  await db
    .update(bills)
    .set({
      service_name,
      vendor_name: vendor_name ?? null,
      category,
      billing_cycle,
      reference_number: reference_number ?? null,
      account_number: account_number ?? null,
      customer_name: customer_name ?? null,
      login_url: login_url ?? null,
      login_email: login_email ?? null,
      amount: String(amount),
      currency,
      due_date,
      last_paid_date: last_paid_date ?? null,
      start_date: start_date ?? null,
      reminder_days_before: reminder_days_before ?? null,
      status,
      notes: notes ?? null,
      whatsapp_sent_at: null,
      google_calendar_event_id: calendarEventId,
    })
    .where(eq(bills.id, id));

  return NextResponse.json({ success: true });
}

// ── DELETE /api/billing/[id] ─────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Fetch bill first to get calendar event id
  const existing = await db
    .select()
    .from(bills)
    .where(eq(bills.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

  // Delete Google Calendar event first
  if (existing?.google_calendar_event_id) {
    await deleteCalendarEvent(existing.google_calendar_event_id);
  }

  await db.delete(bills).where(eq(bills.id, id));
  return NextResponse.json({ success: true });
}
