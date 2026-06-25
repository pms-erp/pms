// src/app/api/portfolio/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { portfolio } from "@/db/schema";
import { v4 as uuidv4 } from "uuid";
import * as XLSX from "xlsx";

// ── Column name normalizer ────────────────────────────────────────────────────
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s_\-+\/()]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Parse date → Date object (Drizzle date column needs Date) ─────────────────
function parseDate(val: unknown): Date | null {
  if (!val) return null;

  // Excel serial number
  if (typeof val === "number") {
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
    } catch {
      return null;
    }
  }

  if (typeof val === "string" && val.trim()) {
    const s = val.trim();

    // ISO format: YYYY-MM-DD
    const iso = Date.parse(s);
    if (!isNaN(iso)) return new Date(iso);

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      const year = y.length === 2 ? `20${y}` : y;
      return new Date(Number(year), Number(m) - 1, Number(d));
    }
  }

  return null;
}

// ── Map one Excel row → Drizzle insert value ──────────────────────────────────
function mapRow(row: Record<string, unknown>, userId: string) {
  // Normalize all keys
  const r: Record<string, string> = {};
  const rawByNorm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = norm(k);
    r[nk] = v != null ? String(v).trim() : "";
    rawByNorm[nk] = v;
  }

  // Find date column (any key containing "date")
  const dateKey = Object.keys(rawByNorm).find((k) => k.includes("date"));
  const projectDate = dateKey ? parseDate(rawByNorm[dateKey]) : null;

  // Project ID + URL column: split if combined
  const projectIdRaw =
    r["project_id_url"] ??
    r["project_id_and_url"] ??
    r["project_id"] ??
    r["id"] ??
    "";

  const projectId = projectIdRaw.startsWith("http")
    ? null
    : projectIdRaw || null;

  const urlFromIdCol = projectIdRaw.startsWith("http") ? projectIdRaw : null;

  const websiteUrl =
    r["website_url"] ||
    r["website"] ||
    r["url"] ||
    r["site_url"] ||
    urlFromIdCol ||
    null;

  const now = new Date();

  // Return object must exactly match NewPortfolio (typeof portfolio.$inferInsert)
  return {
    id: uuidv4(),
    project_date: projectDate, // Date | null ✅
    project_id: projectId, // string | null ✅
    linked_project_id: null as string | null,
    project_name: r["project_name"] || r["name"] || r["title"] || "Untitled",
    customer_name:
      r["customer_name"] ||
      r["client_name"] ||
      r["customer"] ||
      r["client"] ||
      null,
    business_name: r["business_name"] || r["business"] || r["company"] || null,
    email: r["email_address"] || r["email"] || null,
    phone: r["phone_number"] || r["phone"] || r["mobile"] || null,
    source: "OTHER" as const,
    project_type: null as null,
    website_builder: null as null,
    status: "DRAFT" as const,
    website_url: websiteUrl,
    figma_url: null as string | null,
    short_description:
      r["description"] || r["notes"] || r["short_description"] || null,
    featured_image: null as string | null,
    gallery_images: [] as string[], // JSON column ✅
    pdf_documents: [] as string[], // JSON column ✅
    is_public: false,
    created_by: userId,
    created_at: now,
    updated_at: now,
  };
}

// ── POST /api/portfolio/import ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "PROJECT_MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      return NextResponse.json(
        { error: "Only .xlsx, .xls, or .csv files are supported" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No data rows found in the file" },
        { status: 400 },
      );
    }

    if (rows.length > 500) {
      return NextResponse.json(
        { error: "Maximum 500 rows per import" },
        { status: 400 },
      );
    }

    const records = rows.map((row) => mapRow(row, session.user.id));

    // Insert in batches of 50 to avoid query size limits
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      await db.insert(portfolio).values(batch);
      inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      imported: inserted,
      total: rows.length,
    });
  } catch (err) {
    console.error("Portfolio import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
