// src/lib/google-calendar.ts
// Manages Google Calendar events for bill due date reminders.
// Uses a Service Account — no OAuth flow needed, no external packages required.

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

// ── JWT token generation (uses native Web Crypto API — no googleapis needed) ──
async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not set",
    );
  }

  // Fix escaped newlines that come from env vars
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const header = { alg: "RS256", typ: "JWT" };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // Strip PEM headers and decode
  const keyData = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binaryKey = Buffer.from(keyData, "base64");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    Buffer.from(signingInput),
  );

  const jwt =
    signingInput +
    "." +
    Buffer.from(signature)
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type CalendarEventInput = {
  billId: string;
  serviceName: string;
  vendorName?: string | null;
  customerName?: string | null;
  accountNumber?: string | null;
  referenceNumber?: string | null;
  amount: string;
  currency: string;
  dueDate: string; // YYYY-MM-DD
  reminderDaysBefore: number;
  category: string;
  notes?: string | null;
};

// ── Create or Update Calendar Event ──────────────────────────────────────────
export async function upsertCalendarEvent(
  input: CalendarEventInput,
  existingEventId?: string | null,
): Promise<string | null> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    console.error("[gcal] GOOGLE_CALENDAR_ID not set");
    return null;
  }

  try {
    const token = await getAccessToken();

    // Build description
    const descLines = [
      `💰 Amount: ${input.currency} ${parseFloat(input.amount).toLocaleString("en-PK")}`,
      `📁 Category: ${input.category}`,
    ];
    if (input.vendorName) descLines.push(`🏢 Vendor: ${input.vendorName}`);
    if (input.customerName)
      descLines.push(`👤 Customer: ${input.customerName}`);
    if (input.accountNumber)
      descLines.push(`🔢 Account: ${input.accountNumber}`);
    if (input.referenceNumber)
      descLines.push(`📋 Ref: ${input.referenceNumber}`);
    if (input.notes) descLines.push(`📝 Notes: ${input.notes}`);
    descLines.push(``, `⚡ Auto-created by TAIBA PMS`);

    const event = {
      summary: `💰 ${input.serviceName} — ${input.currency} ${parseFloat(input.amount).toLocaleString("en-PK")} DUE`,
      description: descLines.join("\n"),
      // All-day event on the due date
      start: { date: input.dueDate },
      end: { date: input.dueDate },
      // Red color so it stands out
      colorId: "11",
      reminders: {
        useDefault: false,
        overrides: [
          // X days before at 11:45 AM PKT
          {
            method: "popup",
            minutes: input.reminderDaysBefore * 24 * 60 - (11 * 60 + 45),
          },
          {
            method: "email",
            minutes: input.reminderDaysBefore * 24 * 60 - (11 * 60 + 45),
          },
          // On the due day at 11:45 AM PKT
          { method: "popup", minutes: 11 * 60 + 45 },
          { method: "email", minutes: 11 * 60 + 45 },
        ],
      },
      // Store billId so we can find/link it later
      extendedProperties: {
        private: { billId: input.billId },
      },
    };

    let res: Response;

    if (existingEventId) {
      // Update existing event
      res = await fetch(
        `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${existingEventId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );
    } else {
      // Create new event
      res = await fetch(
        `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        },
      );
    }

    if (!res.ok) {
      const err = await res.text();
      console.error("[gcal] Failed to upsert event:", err);
      return null;
    }

    const data = await res.json();
    console.log("[gcal] Event upserted:", data.id);
    return data.id as string;
  } catch (err) {
    console.error("[gcal] upsertCalendarEvent error:", err);
    return null;
  }
}

// ── Delete Calendar Event ─────────────────────────────────────────────────────
export async function deleteCalendarEvent(eventId: string): Promise<boolean> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId || !eventId) return false;

  try {
    const token = await getAccessToken();

    const res = await fetch(
      `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.status === 204 || res.status === 200) {
      console.log("[gcal] Event deleted:", eventId);
      return true;
    }

    const err = await res.text();
    console.error("[gcal] Failed to delete event:", err);
    return false;
  } catch (err) {
    console.error("[gcal] deleteCalendarEvent error:", err);
    return false;
  }
}
