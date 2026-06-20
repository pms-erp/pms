// src/lib/server-storage.ts
import { v2 as cloudinary } from "cloudinary";
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

// Initialize Cloudinary
export function initCloudinary() {
  if (!cloudinary.config().cloud_name) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
}

// Initialize R2/S3 client for server-side operations
export function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `R2 credentials missing: ${!accountId ? "R2_ACCOUNT_ID " : ""}${!accessKeyId ? "R2_ACCESS_KEY_ID " : ""}${!secretAccessKey ? "R2_SECRET_ACCESS_KEY" : ""}`,
    );
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
    forcePathStyle: true,
  });
}

// Helper: detect resource_type for Cloudinary
export function detectResourceType(
  mime: string,
  fileName: string,
): "image" | "video" | "raw" {
  const m = mime.toLowerCase();
  const n = fileName.toLowerCase();

  if (m.startsWith("video/") || n.match(/\.(mp4|webm|mov|avi)$/))
    return "video";
  if (m.startsWith("image/") || n.match(/\.(jpg|jpeg|png|gif|webp|svg)$/))
    return "image";
  return "raw"; // PDFs, docs, etc.
}

// Server-side upload with smart routing
export interface ServerUploadOptions {
  fileName: string;
  fileType: string;
  fileSize: number;
  fileBuffer: Buffer;
  folder?: string;
}

export interface ServerUploadResult {
  url: string;
  public_id: string;
  resource_type: string;
  storage: "cloudinary" | "r2";
  size: number;
}

const CLOUDINARY_MAX = 4 * 1024 * 1024; // 4 MB

export async function uploadToStorage(
  options: ServerUploadOptions,
): Promise<ServerUploadResult> {
  const {
    fileName,
    fileType,
    fileSize,
    fileBuffer,
    folder = "imports",
  } = options;

  // Small files → Cloudinary (server-side upload)
  if (fileSize < CLOUDINARY_MAX) {
    initCloudinary();

    const result = await cloudinary.uploader.upload(
      `data:${fileType};base64,${fileBuffer.toString("base64")}`,
      {
        resource_type: detectResourceType(fileType, fileName),
        folder,
        use_filename: true,
        unique_filename: true,
      },
    );

    return {
      url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      storage: "cloudinary",
      size: result.bytes,
    };
  }

  // Large files → R2 via S3 SDK
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error("R2 credentials not configured for large file upload");
  }

  const r2 = getR2Client();
  const ext = fileName.split(".").pop() || "";
  const key = `${folder}/${uuidv4()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: fileType,
    }),
  );

  const publicFileUrl = `${publicUrl}/${key}`;

  return {
    url: publicFileUrl,
    public_id: key,
    resource_type: detectResourceType(fileType, fileName),
    storage: "r2",
    size: fileSize,
  };
}

// Server-side delete that handles both Cloudinary and R2
export async function deleteFileFromStorage(file: {
  public_id: string;
  resource_type?: string;
  storage?: "cloudinary" | "r2";
  url?: string;
}): Promise<void> {
  if (!file.public_id?.trim() && !file.url) return;

  const storage = file.storage ?? detectStorage(file.url, file.public_id);

  try {
    if (storage === "cloudinary") {
      initCloudinary();
      await cloudinary.uploader.destroy(file.public_id, {
        resource_type: file.resource_type ?? "image",
      });
      console.log(`[storage] Deleted Cloudinary file: ${file.public_id}`);
    } else if (storage === "r2") {
      const r2 = getR2Client();
      const bucket = process.env.R2_BUCKET_NAME;

      if (!bucket) {
        throw new Error("R2_BUCKET_NAME not configured");
      }

      console.log(
        `[storage] Deleting R2 file: ${file.public_id} from bucket: ${bucket}`,
      );

      await r2.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: file.public_id,
        }),
      );

      console.log(`[storage] Successfully deleted R2 file: ${file.public_id}`);
    }
  } catch (err) {
    console.error(
      `[storage] Failed to delete ${storage} file ${file.public_id}:`,
      err,
    );
    // Don't throw — we want task/project deletion to succeed even if storage cleanup fails
  }
}

// Helper: detect storage from URL or public_id pattern
function detectStorage(url?: string, publicId?: string): "cloudinary" | "r2" {
  if (url?.includes("res.cloudinary.com")) return "cloudinary";
  if (url?.includes(process.env.R2_PUBLIC_URL ?? "r2.cloudflarestorage.com"))
    return "r2";
  // Fallback: R2 public_ids often contain folder paths like "uploads/..."
  if (publicId?.includes("/")) return "r2";
  return "cloudinary"; // default
}

// Bulk delete for multiple files
export async function deleteFilesFromStorage(
  files: Array<{
    public_id: string;
    resource_type?: string;
    storage?: "cloudinary" | "r2";
    url?: string;
  }>,
): Promise<void> {
  await Promise.allSettled(files.map((f) => deleteFileFromStorage(f)));
}
