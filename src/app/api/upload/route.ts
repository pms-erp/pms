// app/api/upload/route.ts
// Handles ONLY small files (<4 MB) — uploads to Cloudinary.
// Files ≥4 MB are handled client-side via /api/upload/presign → R2 presigned URL.
// This keeps the request body well under Vercel's 4.5 MB serverless limit.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  v2 as cloudinary,
  UploadApiResponse,
  UploadApiErrorResponse,
} from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const VERCEL_SAFE_MAX = 4 * 1024 * 1024; // 4 MB — Vercel limit is 4.5 MB

function getResourceType(
  mimeType: string,
  fileName: string,
): "image" | "video" | "raw" {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  if (
    mime.startsWith("video/") ||
    /\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v)$/.test(name)
  )
    return "video";
  if (
    mime.startsWith("image/") &&
    !mime.includes("pdf") &&
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|ico|heic)$/.test(name)
  )
    return "image";
  return "raw";
}

function sanitizeFileName(name: string): string {
  const base =
    name
      .replace(/\.[^/.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "file";
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file)
      return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // Reject anything that should have gone through the presign route
    if (file.size >= VERCEL_SAFE_MAX) {
      return NextResponse.json(
        {
          error: `File too large for direct upload (${(file.size / 1024 / 1024).toFixed(1)} MB). Use the presigned upload for files ≥4 MB.`,
          use_presign: true,
        },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sanitized = sanitizeFileName(file.name);
    const folder = `project-management/tasks/${new Date().toISOString().split("T")[0]}`;
    const resourceType = getResourceType(file.type, file.name);

    const result = await new Promise<
      Pick<UploadApiResponse, "secure_url" | "public_id" | "resource_type">
    >((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder,
            public_id: sanitized,
            resource_type: resourceType,
            overwrite: false,
          },
          (
            err: UploadApiErrorResponse | undefined,
            res: UploadApiResponse | undefined,
          ) => {
            if (err)
              reject(
                new Error(err.message ?? `Cloudinary error ${err.http_code}`),
              );
            else if (res)
              resolve({
                secure_url: res.secure_url,
                public_id: res.public_id,
                resource_type: res.resource_type,
              });
            else reject(new Error("Unknown upload error"));
          },
        )
        .end(buffer);
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      storage: "cloudinary",
      name: file.name,
      original_name: file.name,
      size: file.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("Upload error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
