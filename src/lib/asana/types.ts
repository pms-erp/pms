// src/lib/asana/types.ts
// ─── Asana Import/Export Specific Types (SELF-CONTAINED) ─────────────────────

// ✅ Define UploadedFile directly here (no external import needed)
export interface UploadedFile {
  url: string;
  public_id: string;
  resource_type: "image" | "video" | "raw";
  storage: "cloudinary" | "r2";
  name: string;
  original_name: string;
  size: number;
}

// ─── Asana API Response Types ────────────────────────────────────────────────
export interface AsanaWorkspace {
  gid: string;
  name: string;
}

export interface AsanaProject {
  gid: string;
  name: string;
  notes?: string;
  archived?: boolean;
  created_at?: string;
  color?: string;
}

export interface AsanaUser {
  gid: string;
  name: string;
  email?: string;
}

export interface AsanaTask {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  due_on: string | null;
  assignee: AsanaUser | null;
  memberships: Array<{ section?: { name: string } }>;
  custom_fields: Array<{ name: string; display_value: string | null }>;
  created_at: string;
  attachments?: AsanaAttachment[];
}

export interface AsanaAttachment {
  gid: string;
  name: string;
  download_url: string | null;
  view_url: string | null;
  size?: number | null;
  created_at: string;
}

export interface AsanaStory {
  gid: string;
  type: "comment" | "system" | string;
  text: string;
  created_by: AsanaUser | null;
  created_at: string;
  attachments?: AsanaAttachment[];
}

// ─── Import Request/Response Types ───────────────────────────────────────────
export interface AsanaImportRequest {
  token: string;
  projectGids: string[];
  teamType: string;
}

export interface AsanaImportResult {
  success: boolean;
  projects_imported: number;
  tasks_imported: number;
  notes_imported: number;
  files_imported: number;
  errors: string[];
}

// ─── Server Upload Result (matches server-storage.ts) ────────────────────────
export interface ServerUploadResult {
  url: string;
  public_id: string;
  resource_type: string;
  storage: "cloudinary" | "r2";
  size: number;
}

// ─── Asana-Specific File Wrapper ─────────────────────────────────────────────
export interface AsanaImportedFile extends UploadedFile {
  asana_gid: string;
  asana_created_at: string;
  imported_at: string;
  source: "task_description" | "comment";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert server upload result + Asana attachment → AsanaImportedFile
 * Now accepts ServerUploadResult (which doesn't have name/original_name)
 * and gets them from the AsanaAttachment instead
 */
export function toAsanaImportedFile(
  att: AsanaAttachment,
  uploaded: ServerUploadResult,
  source: "task_description" | "comment",
): AsanaImportedFile {
  return {
    url: uploaded.url,
    public_id: uploaded.public_id,
    resource_type: uploaded.resource_type as "image" | "video" | "raw",
    storage: uploaded.storage,
    name: att.name, // ✅ Get from Asana attachment
    original_name: att.name, // ✅ Get from Asana attachment
    size: uploaded.size,
    asana_gid: att.gid,
    asana_created_at: att.created_at,
    imported_at: new Date().toISOString(),
    source,
  };
}

export function toStoredFiles(files: AsanaImportedFile[]): UploadedFile[] {
  return files.map(
    ({ asana_gid, asana_created_at, imported_at, source, ...rest }) => rest,
  );
}

export function parseAsanaFiles(
  json: string | null | undefined,
): AsanaImportedFile[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
