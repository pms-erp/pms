// app/api/notifications/subscribe/route.ts
// Saves the push subscription — includes endpoint deduplication
// so re-subscribing with the same endpoint is a no-op (no DB write).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subscription } = (await req.json()) as {
      subscription?: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
    };

    if (!subscription?.endpoint) {
      return NextResponse.json(
        { error: "No subscription provided" },
        { status: 400 },
      );
    }

    // Check if this exact endpoint is already stored for this user
    const [existing] = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.user_id, session.user.id))
      .limit(1);

    if (existing) {
      // ── Same endpoint → skip write (the common case after first registration)
      if (existing.endpoint === subscription.endpoint) {
        return NextResponse.json({ success: true, changed: false });
      }

      // ── Endpoint rotated (browser re-generated) → update
      await db
        .update(pushSubscriptions)
        .set({
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updated_at: new Date(),
        })
        .where(eq(pushSubscriptions.user_id, session.user.id));

      return NextResponse.json({ success: true, changed: true });
    }

    // ── First time → insert
    await db.insert(pushSubscriptions).values({
      id: uuidv4(),
      user_id: session.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });

    return NextResponse.json({ success: true, changed: true });
  } catch (error) {
    console.error("Error saving push subscription:", error);
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const { getPublicKey } = await import("@/lib/push/utils");
    return NextResponse.json({ publicKey: getPublicKey() });
  } catch (error) {
    console.error("Error getting public key:", error);
    return NextResponse.json(
      { error: "Failed to get public key" },
      { status: 500 },
    );
  }
}
