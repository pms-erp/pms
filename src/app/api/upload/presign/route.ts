// app/api/upload/presign/route.ts
// Generates a presigned R2 URL so the browser can PUT files directly to R2.
// The file bytes never pass through Vercel — no 4.5 MB limit applies.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function sanitizeFileName(name: string): string {
  const ext = name.match(/\.[^/.]+$/)?.[0]?.toLowerCase() ?? "";
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
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

function getResourceType(fileName: string): "image" | "video" | "raw" {
  const n = fileName.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|tiff|heic)$/.test(n)) return "image";
  if (/\.(mp4|webm|mov|avi|mkv|flv|wmv|m4v)$/.test(n)) return "video";
  return "raw";
}

function getMimeType(fileName: string): string {
  const ext = fileName.match(/\.[^/.]+$/)?.[0]?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
    ".rar": "application/x-rar-compressed",
    ".7z": "application/x-7z-compressed",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  };
  return map[ext] ?? "application/octet-stream";
}

// ─── CORS headers — required for browser → R2 direct upload ──────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// POST /api/upload/presign
// Body: { fileName, fileSize, fileType }
// Returns: { presignedUrl, key, publicUrl, resource_type, contentType }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  let body: { fileName?: string; fileSize?: number; fileType?: string };
  try {
    body = (await req.json()) as {
      fileName?: string;
      fileSize?: number;
      fileType?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileName, fileSize, fileType } = body;

  if (!fileName || !fileSize) {
    return NextResponse.json(
      { error: "fileName and fileSize are required" },
      { status: 400 },
    );
  }

  // R2 single-PUT limit is 5 GB
  const MAX = 5 * 1024 * 1024 * 1024;
  if (fileSize > MAX) {
    return NextResponse.json(
      {
        error: `File too large: ${(fileSize / 1024 / 1024 / 1024).toFixed(2)} GB. Maximum is 5 GB.`,
      },
      { status: 413 },
    );
  }

  // Validate required env vars
  if (
    !process.env.R2_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY ||
    !process.env.R2_BUCKET_NAME ||
    !process.env.R2_PUBLIC_URL
  ) {
    console.error("Missing R2 environment variables");
    return NextResponse.json(
      {
        error:
          "Storage not configured — R2 environment variables missing on server",
      },
      { status: 500 },
    );
  }

  try {
    const safe = sanitizeFileName(fileName);
    const date = new Date().toISOString().split("T")[0];
    const key = `uploads/${date}/${safe}`;
    const contentType = fileType || getMimeType(fileName);
    const bucket = process.env.R2_BUCKET_NAME!;
    const publicBase = process.env.R2_PUBLIC_URL!.replace(/\/$/, "");

    const presignedUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 }, // URL valid for 1 hour
    );

    return NextResponse.json(
      {
        presignedUrl,
        key,
        publicUrl: `${publicBase}/${key}`,
        resource_type: getResourceType(fileName),
        contentType,
      },
      { headers: CORS_HEADERS },
    );
  } catch (err) {
    console.error("Presign error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to generate upload URL",
      },
      { status: 500 },
    );
  }
}
