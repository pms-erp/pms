// app/api/account/avatar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── POST — upload new avatar ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file)
      return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload to Cloudinary
    const result = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "avatars",
              public_id: `avatar_${session.user.id}`,
              overwrite: true,
              transformation: [
                { width: 400, height: 400, crop: "fill", gravity: "face" },
              ],
            },
            (err, result) => {
              if (err || !result) reject(err ?? new Error("Upload failed"));
              else resolve(result as { secure_url: string; public_id: string });
            },
          )
          .end(buffer);
      },
    );

    // Save URL to DB
    await db
      .update(users)
      .set({ avatar: result.secure_url })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    console.error("Avatar upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

// ── DELETE — remove avatar ────────────────────────────────────────────────────
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Delete from Cloudinary
    await cloudinary.uploader
      .destroy(`avatars/avatar_${session.user.id}`)
      .catch(() => {});

    // Clear from DB
    await db
      .update(users)
      .set({ avatar: null })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avatar remove error:", error);
    return NextResponse.json(
      { error: "Failed to remove avatar" },
      { status: 500 },
    );
  }
}
