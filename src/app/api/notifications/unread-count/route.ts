import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/notifications/service";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await getUnreadNotificationCount(session.user.id);

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error getting unread count:", error);
    return NextResponse.json(
      { error: "Failed to get unread count" },
      { status: 500 },
    );
  }
}
