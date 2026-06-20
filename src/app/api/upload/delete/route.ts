// app/api/upload/delete/route.ts
// Deletes a file from Cloudinary or Cloudflare R2 based on storage type.
// POST body: { public_id: string, resource_type?: string, storage?: "cloudinary" | "r2" }

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

// ─── Detect storage from public_id or url ────────────────────────────────────
// R2 keys look like: uploads/2024-01-01/filename-123.zip
// Cloudinary public_ids look like: project-management/tasks/2024-01-01/filename-123
function detectStorage(
  publicId: string,
  url?: string,
  storage?: string,
): "cloudinary" | "r2" {
  if (storage === "cloudinary" || storage === "r2") return storage;
  // R2 public URLs contain the R2 public URL domain
  if (
    url &&
    process.env.R2_PUBLIC_URL &&
    url.startsWith(process.env.R2_PUBLIC_URL)
  )
    return "r2";
  // R2 keys start with uploads/
  if (publicId.startsWith("uploads/")) return "r2";
  return "cloudinary";
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    public_id?: string;
    resource_type?: string;
    storage?: string;
    url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { public_id, resource_type, storage, url } = body;

  if (!public_id) {
    return NextResponse.json({ error: "public_id required" }, { status: 400 });
  }

  // Skip files with no real public_id (old string-only format)
  if (public_id.trim() === "") {
    return NextResponse.json({ success: true, skipped: true });
  }

  const target = detectStorage(public_id, url, storage);

  try {
    if (target === "r2") {
      // R2: public_id is the object key (e.g. uploads/2024-01-01/file.zip)
      await r2.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: public_id,
        }),
      );
      console.log(`Deleted from R2: ${public_id}`);
    } else {
      // Cloudinary: resource_type must match what was used during upload
      const resType = (resource_type ?? "image") as "image" | "video" | "raw";
      await cloudinary.uploader.destroy(public_id, { resource_type: resType });
      console.log(`Deleted from Cloudinary: ${public_id} (${resType})`);
    }

    return NextResponse.json({ success: true, storage: target });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    console.error(`File delete error (${target}):`, message);
    // Return success anyway — the DB record will still be removed
    // so the file just becomes orphaned in storage (not a breaking error)
    return NextResponse.json({
      success: true,
      warning: message,
      storage: target,
    });
  }
}
