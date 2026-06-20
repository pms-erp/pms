"use client";

// components/attendance-import-button.tsx
//
// Drop next to AttendanceExportButton — mirrors its API exactly.
// Accepts the SAME .xlsx format produced by the export route.
// On success shows: "X added, Y skipped (already existed)"

import { useRef, useState } from "react";
import {
  IconUpload,
  IconLoader2,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
  message: string;
}

export function AttendanceImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openFilePicker() {
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected after viewing results
    e.target.value = "";

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Please select an .xlsx or .xls file");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/attendance/import", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? `Import failed (HTTP ${res.status})`);
        return;
      }

      const r = data as ImportResult;
      setResult(r);
      setDialogOpen(true);

      // Quick toast for happy path
      if (r.inserted > 0 || r.skipped > 0) {
        toast.success(
          `${r.inserted} records imported, ${r.skipped} already existed`,
        );
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Network error — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFile}
      />

      {/* Trigger button */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={openFilePicker}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconUpload className="h-4 w-4" />
              )}
              {loading ? "Importing…" : "Import Excel"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Upload an attendance .xlsx file (same format as export)</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Existing records are skipped automatically — no duplicates.
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Result dialog */}
      {result && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconCheck className="h-5 w-5 text-green-600" />
                Import Complete
              </DialogTitle>
              <DialogDescription>{result.message}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-xl p-3 bg-green-50 border-green-200 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {result.inserted}
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">Records added</p>
                </div>
                <div className="border rounded-xl p-3 bg-muted/40 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">
                    {result.skipped}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Already existed (skipped)
                  </p>
                </div>
              </div>

              {/* Row-level errors */}
              {result.errors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <IconAlertCircle className="h-3.5 w-3.5" />
                    {result.errors.length} rows had issues and were skipped:
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-0.5">
                    {result.errors.map((e, i) => (
                      <p
                        key={i}
                        className="text-[11px] text-amber-800 font-mono"
                      >
                        {e}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setDialogOpen(false)} className="w-full">
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
