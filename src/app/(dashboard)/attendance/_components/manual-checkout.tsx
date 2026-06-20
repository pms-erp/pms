"use client";

// app/(dashboard)/attendance/_components/manual-checkout.tsx
//
// Shows a PREVIEW dialog before executing so admin can verify:
//   - Which employees will be auto-checked out
//   - What their checkout time will be (always office end time)
//   - Their total hours and status
//   - Which records will be skipped and why
//
// This makes it impossible to wonder "what time will they be checked out" —
// you see the exact data before committing.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconLoader,
  IconClockCheck,
  IconEye,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconClock,
} from "@tabler/icons-react";

interface PreviewRecord {
  attendance_id: string;
  user_id: string;
  userName: string;
  userRole: string;
  date: string;
  check_in_pkt: string;
  check_out_pkt: string | null; // null if will be skipped
  total_hours: number | null;
  status: string | null;
  will_process: boolean;
  skip_reason: string | null;
}

interface PreviewData {
  office_end_time: string; // e.g. "18:00"
  today_pkt: string;
  total: number;
  will_process: number;
  will_skip: number;
  records: PreviewRecord[];
}

const STATUS_STYLE: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-700 border-green-200",
  HALF_DAY: "bg-yellow-100 text-yellow-700 border-yellow-200",
};

export function AdminAutoCheckoutButton() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);

  // ── Step 1: Load preview ──────────────────────────────────────────────────
  async function handlePreview() {
    setPreviewing(true);
    try {
      const res = await fetch("/api/attendance/auto-checkout");
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to load preview");
        return;
      }

      if (data.total === 0) {
        toast.info("No forgotten check-outs found — everyone is checked out.");
        return;
      }

      setPreview(data as PreviewData);
      setPreviewOpen(true);
    } catch {
      toast.error("Network error — could not load preview");
    } finally {
      setPreviewing(false);
    }
  }

  // ── Step 2: Execute after admin confirms ──────────────────────────────────
  async function handleExecute() {
    setExecuting(true);
    try {
      const res = await fetch("/api/attendance/auto-checkout", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Failed to process");
        return;
      }

      toast.success(data.message);
      setPreviewOpen(false);
      setPreview(null);
    } catch {
      toast.error("Network error occurred");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <>
      {/* Trigger button — opens preview, not execute */}
      <Button
        onClick={handlePreview}
        disabled={previewing}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        {previewing ? (
          <IconLoader className="h-4 w-4 animate-spin" />
        ) : (
          <IconEye className="h-4 w-4" />
        )}
        {previewing ? "Loading…" : "Fix Forgotten Check-Outs"}
      </Button>

      {/* Preview + Confirm dialog */}
      {preview && (
        <Dialog
          open={previewOpen}
          onOpenChange={(open) => {
            if (!open && !executing) setPreviewOpen(false);
          }}
        >
          <DialogContent className="sm:max-w-[780px] max-h-[90vh] flex flex-col gap-0 p-0">
            <DialogHeader className="px-6 pt-5 pb-4 border-b">
              <DialogTitle className="flex items-center gap-2">
                <IconClockCheck className="h-5 w-5 text-amber-600" />
                Preview — Forgotten Check-Outs
              </DialogTitle>
              <DialogDescription>
                All checkout times are set to office end time{" "}
                <strong className="text-foreground">
                  {preview.office_end_time} PKT
                </strong>
                . Review before confirming.
              </DialogDescription>
            </DialogHeader>

            {/* Summary bar */}
            <div className="flex items-center gap-6 px-6 py-3 bg-muted/30 border-b text-sm">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                  <IconCheck className="h-3.5 w-3.5 text-green-600" />
                </div>
                <span>
                  <strong className="text-green-700">
                    {preview.will_process}
                  </strong>{" "}
                  will be fixed
                </span>
              </div>
              {preview.will_skip > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <IconX className="h-3.5 w-3.5 text-amber-600" />
                  </div>
                  <span>
                    <strong className="text-amber-700">
                      {preview.will_skip}
                    </strong>{" "}
                    will be skipped
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 ml-auto text-muted-foreground">
                <IconClock className="h-4 w-4" />
                <span>
                  Checkout time:{" "}
                  <strong className="text-foreground">
                    {preview.office_end_time} PKT
                  </strong>
                </span>
              </div>
            </div>

            {/* Records table */}
            <div className="overflow-y-auto flex-1 px-0">
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0">
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out (PKT)</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.records.map((r) => (
                    <TableRow
                      key={r.attendance_id}
                      className={r.will_process ? "" : "opacity-50 bg-muted/20"}
                    >
                      <TableCell>
                        <p className="text-sm font-medium">{r.userName}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {r.userRole.replace(/_/g, " ").toLowerCase()}
                        </p>
                      </TableCell>

                      <TableCell className="text-sm">{r.date}</TableCell>

                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {r.check_in_pkt.replace(" PKT", "")}
                      </TableCell>

                      {/* This column proves checkout = office end time */}
                      <TableCell>
                        {r.will_process ? (
                          <span className="text-sm font-mono font-semibold text-green-700">
                            {r.check_out_pkt?.replace(" PKT", "")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-sm font-mono">
                        {r.will_process && r.total_hours !== null
                          ? `${r.total_hours.toFixed(1)}h`
                          : "—"}
                      </TableCell>

                      <TableCell>
                        {r.will_process && r.status ? (
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_STYLE[r.status] ?? ""}`}
                          >
                            {r.status.replace("_", " ")}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            skipped
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        {r.will_process ? (
                          <IconCheck className="h-4 w-4 text-green-600" />
                        ) : (
                          <div title={r.skip_reason ?? ""}>
                            <IconAlertCircle className="h-4 w-4 text-amber-500" />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Skip reasons */}
            {preview.records.some((r) => !r.will_process) && (
              <div className="px-6 py-3 border-t bg-amber-50">
                <p className="text-xs font-medium text-amber-800 mb-1">
                  Skipped records:
                </p>
                {preview.records
                  .filter((r) => !r.will_process)
                  .map((r) => (
                    <p key={r.attendance_id} className="text-xs text-amber-700">
                      <strong>{r.userName}</strong> ({r.date}) — {r.skip_reason}
                    </p>
                  ))}
              </div>
            )}

            <DialogFooter className="px-6 py-4 border-t gap-2">
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(false)}
                disabled={executing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExecute}
                disabled={executing || preview.will_process === 0}
                className="gap-2"
              >
                {executing ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <IconClockCheck className="h-4 w-4" /> Fix{" "}
                    {preview.will_process} Check-Out
                    {preview.will_process !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
