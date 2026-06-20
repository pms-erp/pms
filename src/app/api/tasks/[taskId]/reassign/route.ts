import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { createNotification } from "@/lib/notifications/service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Await params in Next.js 15+
    const { taskId } = await params;

    const { assigned_to } = await req.json();

    if (!assigned_to) {
      return NextResponse.json(
        { error: "Assignee ID is required" },
        { status: 400 },
      );
    }

    // Verify the user exists
    const userExists = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, assigned_to))
      .limit(1);

    if (userExists.length === 0) {
      return NextResponse.json(
        { error: "Assigned user not found" },
        { status: 404 },
      );
    }

    // Update the assigned_to field on the task and updated_at
    await db
      .update(tasks)
      .set({
        assigned_to,
        updated_at: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Send notification to the newly assigned user
    try {
      await createNotification({
        userId: assigned_to,
        taskId,
        type: "TASK_ASSIGNED",
        title: "Task Reassigned to You",
        message: "A task has been reassigned to you. Please check the details.",
      });
    } catch (error) {
      console.error("❌ Failed to create reassignment notification:", error);
    }

    return NextResponse.json({
      success: true,
      message: "Task reassigned successfully",
    });
  } catch (error) {
    console.error("Reassign task error:", error);
    return NextResponse.json(
      { error: "Failed to reassign task" },
      { status: 500 },
    );
  }
}
