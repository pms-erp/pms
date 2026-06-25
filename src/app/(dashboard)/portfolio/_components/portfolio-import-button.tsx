"use client";
// src/app/(dashboard)/portfolio/_components/portfolio-import-button.tsx

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  IconUpload,
  IconFileSpreadsheet,
  IconCheck,
  IconX,
  IconDownload,
  IconLoader2,
} from "@tabler/icons-react";

interface PortfolioImportButtonProps {
  onImported: () => void;
}

type ImportState = "idle" | "uploading" | "success" | "error";

export function PortfolioImportButton({
  onImported,
}: PortfolioImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ImportState>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    imported: number;
    total: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setState("idle");
    setProgress(0);
    setResult(null);
    setErrorMsg("");
  };

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      toast.error("Only .xlsx, .xls, or .csv files are supported");
      return;
    }

    setState("uploading");
    setProgress(10);

    try {
      const fd = new FormData();
      fd.append("file", file);

      setProgress(30);
      const res = await fetch("/api/portfolio/import", {
        method: "POST",
        body: fd,
      });
      setProgress(80);

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "Import failed");
      }

      setProgress(100);
      setResult({ imported: json.imported, total: json.total });
      setState("success");
      toast.success(`${json.imported} portfolio entries imported successfully`);
      onImported();
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : "Import failed");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // Download a sample template
  const downloadTemplate = () => {
    const headers = [
      "Project Date",
      "Project Name",
      "Customer Name",
      "Business Name",
      "Project ID",
      "Website URL",
      "Email Address",
      "Phone Number",
      "Description",
    ];
    const sample = [
      "2026-06-01",
      "Sweet on Vermont Store",
      "Jane Smith",
      "Sweet on Vermont LLC",
      "PRJ-001",
      "https://sweetonvermont.com",
      "jane@sweetonvermont.com",
      "+1 555 000 0001",
      "WooCommerce store with custom product table",
    ];
    const csv = [headers.join(","), sample.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "portfolio-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="gap-1.5"
      >
        <IconFileSpreadsheet className="h-4 w-4" />
        Import
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Import Portfolio from Excel</DialogTitle>
            <DialogDescription>
              Upload an .xlsx, .xls, or .csv file. Each row becomes a portfolio
              entry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Download template */}
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-xs text-primary hover:underline"
            >
              <IconDownload className="h-3.5 w-3.5" />
              Download sample template (.csv)
            </button>

            {/* Expected columns */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground mb-1.5">
                Expected columns (any order):
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {[
                  "Project Date",
                  "Project Name",
                  "Customer Name",
                  "Business Name",
                  "Project ID",
                  "Website URL",
                  "Email Address",
                  "Phone Number",
                  "Description",
                ].map((col) => (
                  <span key={col} className="flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                    {col}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px]">
                Missing columns will be left empty. Max 500 rows.
              </p>
            </div>

            {/* Drop zone */}
            {state === "idle" && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-8 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <IconUpload className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Drop your file here</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    .xlsx · .xls · .csv
                  </p>
                </div>
              </div>
            )}

            {/* Uploading */}
            {state === "uploading" && (
              <div className="space-y-3 rounded-xl border bg-muted/20 px-4 py-5">
                <div className="flex items-center gap-3">
                  <IconLoader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Importing…</p>
                    <p className="text-xs text-muted-foreground">
                      Processing your file
                    </p>
                  </div>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            {/* Success */}
            {state === "success" && result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-4 py-4 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
                    <IconCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    Import successful
                  </p>
                </div>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 pl-9">
                  {result.imported} of {result.total} rows imported
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-500 pl-9">
                  All entries created as Draft · Source set to Other
                </p>
                <div className="pl-9 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      reset();
                      setOpen(false);
                    }}
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {state === "error" && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                    <IconX className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    Import failed
                  </p>
                </div>
                <p className="text-xs text-red-600 dark:text-red-400 pl-9">
                  {errorMsg}
                </p>
                <div className="pl-9">
                  <Button size="sm" variant="outline" onClick={reset}>
                    Try again
                  </Button>
                </div>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
