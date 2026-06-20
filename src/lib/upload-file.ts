// src/lib/upload-file.ts
// ─── Storage routing ──────────────────────────────────────────────────────────
// < 4 MB  → POST /api/upload → server → Cloudinary
//           (safe under Vercel's 4.5 MB serverless body limit)
// ≥ 4 MB  → POST /api/upload/presign → get signed URL → PUT directly to R2
//           (browser uploads straight to Cloudflare R2, Vercel never sees the bytes)

export interface UploadResult {
  url: string;
  public_id: string;
  resource_type: string;
  storage: "cloudinary" | "r2";
  name: string;
  original_name: string;
  size: number;
}

// Vercel serverless body limit is 4.5 MB — keep well under it
const CLOUDINARY_MAX = 4 * 1024 * 1024; // 4 MB

// ─── Small: server proxies to Cloudinary (<4 MB) ─────────────────────────────
async function uploadSmall(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as UploadResult & {
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && !data.error) resolve(data);
        else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(fd);
  });
}

// ─── Large: browser PUTs directly to R2 (≥4 MB) ─────────────────────────────
// Vercel never sees the file — no body limit applies
async function uploadLarge(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  onProgress?.(1);

  // Step 1: ask server for a presigned R2 URL (tiny JSON request, no file bytes)
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || "application/octet-stream",
    }),
  });

  if (!presignRes.ok) {
    let errMsg = "Failed to get upload URL";
    try {
      const err = (await presignRes.json()) as { error?: string };
      errMsg = err.error ?? errMsg;
    } catch {
      /* ignore parse error */
    }
    // Common causes: R2 env vars not set on Vercel, or presign route not deployed
    throw new Error(errMsg);
  }

  const { presignedUrl, key, publicUrl, resource_type, contentType } =
    (await presignRes.json()) as {
      presignedUrl: string;
      key: string;
      publicUrl: string;
      resource_type: string;
      contentType: string;
    };

  onProgress?.(5);

  // Step 2: PUT directly to R2 from the browser (bypasses Vercel completely)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(5 + Math.round((e.loaded / e.total) * 94));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(new Error(`R2 upload failed: ${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload to R2"));
    xhr.send(file);
  });

  onProgress?.(100);

  return {
    url: publicUrl,
    public_id: key,
    resource_type,
    storage: "r2",
    name: file.name,
    original_name: file.name,
    size: file.size,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  return file.size >= CLOUDINARY_MAX
    ? uploadLarge(file, onProgress)
    : uploadSmall(file, onProgress);
}

export async function uploadFiles(
  files: File[],
  onProgress?: (fileIndex: number, pct: number) => void,
): Promise<UploadResult[]> {
  return Promise.all(
    files.map((file, i) => uploadFile(file, (pct) => onProgress?.(i, pct))),
  );
}

// ─── Delete a file from Cloudinary or R2 ─────────────────────────────────────
export async function deleteFile(file: {
  public_id: string;
  resource_type?: string;
  storage?: string;
  url?: string;
}): Promise<void> {
  if (!file.public_id?.trim()) return; // nothing to delete

  try {
    await fetch("/api/upload/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_id: file.public_id,
        resource_type: file.resource_type,
        storage: file.storage,
        url: file.url,
      }),
    });
    // Non-blocking — we don't throw on storage delete failure
    // The DB record is removed regardless
  } catch {
    console.warn("Storage delete failed for:", file.public_id);
  }
}
