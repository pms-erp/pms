// src/app/api/billing/[id]/mark-paid/route.ts
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

// ── Helper: calculate next due date based on billing cycle ───────────────────
function getNextDueDate(currentDueDate: string, billingCycle: string): string {
  const due = new Date(currentDueDate);

  switch (billingCycle) {
    case "MONTHLY":
      due.setMonth(due.getMonth() + 1);
      break;
    case "QUARTERLY":
      due.setMonth(due.getMonth() + 3);
      break;
    case "SEMI_ANNUAL":
      due.setMonth(due.getMonth() + 6);
      break;
    case "ANNUAL":
      due.setFullYear(due.getFullYear() + 1);
      break;
    case "ONE_TIME":
    default:
      // One-time bills don't recur — return same date
      return currentDueDate;
  }

  return due.toISOString().split("T")[0];
}

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Fetch bill to get all details needed for calendar update
  const existing = await db
    .select()
    .from(bills)
    .where(eq(bills.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!existing) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  // ── Calculate next due date ───────────────────────────────────────────────
  const currentDueDate =
    typeof existing.due_date === "string"
      ? existing.due_date
      : (existing.due_date as Date).toISOString().split("T")[0];

  const nextDueDate = getNextDueDate(currentDueDate, existing.billing_cycle);
  const isOneTime = existing.billing_cycle === "ONE_TIME";

  // ── Handle Google Calendar ────────────────────────────────────────────────
  let calendarEventId = existing.google_calendar_event_id ?? null;

  if (isOneTime) {
    // One-time bill — delete the calendar event, it won't recur
    if (calendarEventId) {
      await deleteCalendarEvent(calendarEventId);
      calendarEventId = null;
    }
  } else {
    // Recurring bill — move the calendar event to the next due date
    const newEventId = await upsertCalendarEvent(
      {
        billId: id,
        serviceName: existing.service_name,
        vendorName: existing.vendor_name ?? null,
        customerName: existing.customer_name ?? null,
        accountNumber: existing.account_number ?? null,
        referenceNumber: existing.reference_number ?? null,
        amount: String(existing.amount),
        currency: existing.currency,
        dueDate: nextDueDate, // ← next month's date
        reminderDaysBefore: existing.reminder_days_before ?? 1,
        category: existing.category,
        notes: existing.notes ?? null,
      },
      calendarEventId, // update existing event instead of creating new
    );
    calendarEventId = newEventId;
  }

  const dueDateToSave = new Date(isOneTime ? currentDueDate : nextDueDate);

  // ── Update bill in DB ─────────────────────────────────────────────────────
  await db
    .update(bills)
    .set({
      last_paid_date: today,
      due_date: dueDateToSave,
      whatsapp_sent_at: null, // reset so reminder fires again next cycle
      google_calendar_event_id: calendarEventId,
    })
    .where(eq(bills.id, id));

  return NextResponse.json({
    success: true,
    next_due_date: isOneTime ? null : nextDueDate,
    calendar_updated: !!calendarEventId,
  });
}
