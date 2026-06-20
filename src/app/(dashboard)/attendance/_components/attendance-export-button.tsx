"use client";

// components/attendance-export-button.tsx
// Drop this button anywhere on the attendance page.
// It reads the currently selected month and triggers a file download.

import { useState } from "react";
import { IconDownload, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AttendanceExportButtonProps {
  /** Currently viewed month in YYYY-MM format, e.g. "2026-05" */
  month: string;
  /** Optional label override. Defaults to "Export Excel" */
  label?: string;
}

export function AttendanceExportButton({
  month,
  label = "Export Excel",
}: AttendanceExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    if (loading) return;
    setLoading(true);

    try {
      const res = await fetch(
        `/api/attendance/export?month=${encodeURIComponent(month)}`,
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error ?? "Export failed. Please try again.");
        return;
      }

      // Stream the blob and trigger a browser download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Something went wrong during export.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconDownload className="h-4 w-4" />
            )}
            {loading ? "Exporting…" : label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Download {month} attendance as Excel (.xlsx)</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
