// src/app/api/client/messages/[messageId]/route.ts
// PATCH — edit a message (sender only)
// DELETE — soft-delete a message + hard-delete its attachment from Cloudinary/R2

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { projectMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { pusherServer } from "@/lib/pusher";
import { v2 as cloudinary } from "cloudinary";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// ── Storage clients (same config as /api/upload/delete) ──────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// ── Attachment type ───────────────────────────────────────────────────────────

type AttachmentMeta = {
  public_id?: string;
  storage?: "cloudinary" | "r2";
  resource_type?: string;
  url?: string;
};

// ── Detect storage from public_id / url (mirrors /api/upload/delete logic) ───

function detectStorage(
  publicId: string,
  url?: string,
  storage?: string,
): "cloudinary" | "r2" {
  if (storage === "cloudinary" || storage === "r2") return storage;
  if (
    url &&
    process.env.R2_PUBLIC_URL &&
    url.startsWith(process.env.R2_PUBLIC_URL)
  )
    return "r2";
  if (publicId.startsWith("uploads/")) return "r2";
  return "cloudinary";
}

// ── Delete a single attachment directly (no HTTP hop) ─────────────────────────

async function deleteAttachment(att: AttachmentMeta): Promise<void> {
  const publicId = att.public_id?.trim();
  if (!publicId) return;

  const target = detectStorage(publicId, att.url, att.storage);

  try {
    if (target === "r2") {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: publicId,
        }),
      );
      console.log(`[chat-delete] R2 deleted: ${publicId}`);
    } else {
      const resType = (att.resource_type ?? "image") as
        | "image"
        | "video"
        | "raw";
      await cloudinary.uploader.destroy(publicId, { resource_type: resType });
      console.log(`[chat-delete] Cloudinary deleted: ${publicId} (${resType})`);
    }
  } catch (err) {
    // Log but don't throw — DB row is already being soft-deleted,
    // a storage failure should not block the API response.
    console.error(`[chat-delete] Storage delete failed (${target}):`, err);
  }
}

// ── PATCH /api/client/messages/[messageId] ────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await params;

  const msg = await db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.id, messageId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!msg)
    return NextResponse.json({ error: "Message not found" }, { status: 404 });

  if (msg.sender_id !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (msg.is_deleted)
    return NextResponse.json(
      { error: "Cannot edit a deleted message" },
      { status: 400 },
    );

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newText = body.message?.trim();
  if (!newText)
    return NextResponse.json(
      { error: "Message cannot be empty" },
      { status: 400 },
    );

  const now = new Date();

  await db
    .update(projectMessages)
    .set({ message: newText, edited_at: now })
    .where(eq(projectMessages.id, messageId));

  await pusherServer.trigger(
    `project-chat-${msg.project_id}`,
    "message_edited",
    {
      id: messageId,
      message: newText,
      edited_at: now.toISOString(),
    },
  );

  return NextResponse.json({ success: true });
}

// ── DELETE /api/client/messages/[messageId] ───────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await params;

  const msg = await db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.id, messageId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!msg)
    return NextResponse.json({ error: "Message not found" }, { status: 404 });

  // Sender can delete their own; ADMIN/PM can delete any
  const canDelete =
    msg.sender_id === session.user.id ||
    session.user.role === "ADMIN" ||
    session.user.role === "PROJECT_MANAGER";

  if (!canDelete)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── 1. Parse attachment BEFORE wiping the row ─────────────────────────────
  let attachmentMeta: AttachmentMeta | null = null;
  if (msg.attachment) {
    try {
      attachmentMeta = JSON.parse(msg.attachment) as AttachmentMeta;
    } catch {
      // malformed JSON — skip storage delete
    }
  }

  // ── 2. Soft-delete the DB row ─────────────────────────────────────────────
  await db
    .update(projectMessages)
    .set({
      is_deleted: true,
      message: "",
      attachment: null, // clear so attachment is not accessible via API
    })
    .where(eq(projectMessages.id, messageId));

  // ── 3. Broadcast deletion to all Pusher subscribers ───────────────────────
  await pusherServer.trigger(
    `project-chat-${msg.project_id}`,
    "message_deleted",
    { id: messageId },
  );

  // ── 4. Hard-delete from Cloudinary / R2 ──────────────────────────────────
  // Done AFTER the DB update + Pusher broadcast so the UI updates instantly.
  // Storage failure is non-fatal — logged but does not affect the response.
  if (attachmentMeta?.public_id) {
    // Fire-and-forget is fine here since the DB row is already cleaned up
    deleteAttachment(attachmentMeta).catch((err) =>
      console.error("[chat-delete] Unexpected storage error:", err),
    );
  }

  return NextResponse.json({ success: true });
}
