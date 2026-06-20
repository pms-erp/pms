"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  IconLoader,
  IconEdit,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
  IconAlertTriangle,
  IconBuildingBank,
  IconCash,
  IconCalendarOff,
  IconCoffee,
  IconClock,
  IconCalendar,
  IconGift,
  IconTrendingUp,
  IconTrendingDown,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconArrowsExchange,
  IconScissors,
} from "@tabler/icons-react";

interface PayrollRecord {
  id: string;
  user_id: string;
  month: string;
  working_days: number;
  daily_work_minutes: number;
  break_minutes: number;
  break_minutes_friday: number;
  expected_minutes: number;
  actual_minutes: string;
  diff_minutes: string;
  base_salary: string;
  per_minute_rate: string;
  excused_days: number;
  beneficiary_minutes: number;
  remaining_amount: string;
  extra_pay: string;
  deduction: string;
  work_deduction: string;
  break_deduction: string;
  manual_deduction_minutes: number;
  manual_deduction: string;
  final_salary: string;
  status: string;
  notes: string | null;
  userName: string | null;
  userAvatar: string | null;
  userRole: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountTitle: string | null;
}

interface Props {
  isAdmin: boolean;
  userId: string;
  selectedMonth: string;
  refreshKey: number;
  onRefresh: () => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function fmt(n: string | number, decimals = 2) {
  return parseFloat(String(n)).toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtMinutes(mins: string | number) {
  const m = Math.round(parseFloat(String(mins)));
  const sign = m < 0 ? "−" : m > 0 ? "+" : "";
  return `${sign}${Math.abs(m).toLocaleString("en-PK")}m`;
}

function fmtMinutesAbs(mins: string | number) {
  const m = Math.round(Math.abs(parseFloat(String(mins))));
  return `${m.toLocaleString("en-PK")}m`;
}

function deductionToMinutes(deduction: string, perMinuteRate: string): number {
  const rate = parseFloat(perMinuteRate);
  const ded = parseFloat(deduction);
  if (rate <= 0) return 0;
  return Math.round(ded / rate);
}

function calculateTotalAllowedBreaks(
  workingDays: number,
  breakMinutes: number,
  breakMinutesFriday: number,
): number {
  const fridays = Math.round(workingDays * 0.2);
  const otherDays = workingDays - fridays;
  return otherDays * breakMinutes + fridays * breakMinutesFriday;
}

function monthInfo(m: string) {
  const start = new Date(m + "T00:00:00");
  const periodEnd = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const payDate = new Date(start.getFullYear(), start.getMonth() + 1, 5);
  const fmtShort = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtFull = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const fmtLong = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return {
    label: fmtFull(start),
    period: `${fmtShort(start)} – ${fmtShort(periodEnd)}, ${start.getFullYear()}`,
    paymentDate: fmtLong(payDate),
  };
}

function calculatePayrollSummary(records: PayrollRecord[]) {
  const totalRecords = records.length;
  const totalAmount = records.reduce(
    (sum, r) => sum + parseFloat(r.final_salary || "0"),
    0,
  );
  const totalDeductions = records.reduce(
    (sum, r) => sum + parseFloat(r.deduction || "0"),
    0,
  );
  const totalExtraPay = records.reduce(
    (sum, r) => sum + parseFloat(r.extra_pay || "0"),
    0,
  );
  const totalRemaining = records.reduce(
    (sum, r) => sum + parseFloat(r.remaining_amount || "0"),
    0,
  );
  return {
    totalRecords,
    totalAmount,
    totalDeductions,
    totalExtraPay,
    totalRemaining,
  };
}

const STATUS_STYLE: Record<string, string> = {
  CALCULATED: "bg-blue-100 text-blue-700 border-blue-200",
  PAID: "bg-green-100 text-green-700 border-green-200",
};

async function exportPayrollToExcel(records: PayrollRecord[], month: string) {
  try {
    const XLSX = await import("xlsx");

    const exportData = records.map((r) => ({
      "Employee Name": r.userName ?? "Unknown",
      "Bank Name": r.bankName ?? "Not Set",
      "Account Title": r.bankAccountTitle ?? "Not Set",
      "Account Number": r.bankAccountNumber ?? "Not Set",
      "Remaining Amount (PKR)": parseFloat(r.remaining_amount || "0").toFixed(
        2,
      ),
      "Final Salary (PKR)": parseFloat(r.final_salary || "0").toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws["!cols"] = [
      { wch: 25 },
      { wch: 20 },
      { wch: 25 },
      { wch: 20 },
      { wch: 22 },
      { wch: 18 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");

    const monthLabel = monthInfo(month).label.replace(/\s+/g, "_");
    const filename = `Payroll_${monthLabel}.xlsx`;
    XLSX.writeFile(wb, filename);

    toast.success("Payroll exported successfully!", {
      description: `${records.length} records exported to ${filename}`,
    });
  } catch (err) {
    console.error("Export failed:", err);
    toast.error("Failed to export payroll", {
      description: "Please try again or contact support",
    });
  }
}

export function PayrollTable({
  isAdmin,
  userId,
  selectedMonth,
  refreshKey,
  onRefresh,
}: Props) {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRec, setEditRec] = useState<PayrollRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isAdmin) params.set("userId", userId);
      if (selectedMonth) params.set("month", selectedMonth);
      params.set("_t", Date.now().toString());

      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await fetch(`/api/payroll${qs}`).then((r) => r.json());
      setRecords(data.records ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userId, selectedMonth, refreshKey]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const summary = useMemo(() => calculatePayrollSummary(records), [records]);

  async function handleRecalculateAll() {
    if (!selectedMonth) return;
    setRecalculating(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      if (data.errors && data.errors > 0) {
        toast.warning(data.message, {
          description: "Check server logs for details on failed users.",
          duration: 6000,
        });
      } else {
        toast.success(data.message ?? "Payroll recalculated");
      }

      fetchRecords();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to recalculate");
    } finally {
      setRecalculating(false);
    }
  }

  async function handleSaveEdit() {
    if (!editRec) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editRec.id,
          excused_days: editRec.excused_days,
          remaining_amount: editRec.remaining_amount,
          manual_deduction_minutes: editRec.manual_deduction_minutes ?? 0,
          status: editRec.status,
          notes: editRec.notes ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        data.recalculated ? "Saved and salary recalculated" : "Record updated",
      );
      setEditRec(null);
      fetchRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payroll?id=${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Record deleted");
      setDeleteId(null);
      fetchRecords();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm">
                <IconCash className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {monthInfo(selectedMonth).label}
                </span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <IconCalendar className="h-3.5 w-3.5" />
                  Attendance:{" "}
                  <strong className="text-foreground ml-0.5">
                    {monthInfo(selectedMonth).period}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  💰 Payment due:{" "}
                  <strong className="text-green-600 ml-0.5">
                    {monthInfo(selectedMonth).paymentDate}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => exportPayrollToExcel(records, selectedMonth)}
                disabled={loading || records.length === 0}
                title="Export payroll to Excel"
              >
                📊 Export Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={handleRecalculateAll}
                disabled={recalculating}
              >
                {recalculating ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" />{" "}
                    Recalculating…
                  </>
                ) : (
                  "Force Recalculate All"
                )}
              </Button>
            </div>
          </div>

          {!loading && records.length > 0 && (
            <div
              className={`grid gap-4 grid-cols-2 ${summary.totalRemaining !== 0 ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
            >
              <div className="p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total Employees
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      {summary.totalRecords}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <IconCash className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total Payroll
                    </p>
                    <p className="text-2xl font-bold mt-1 text-green-600">
                      PKR {fmt(summary.totalAmount)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <IconCash className="h-5 w-5 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total Extra Pay
                    </p>
                    <p className="text-2xl font-bold mt-1 text-emerald-600">
                      +PKR {fmt(summary.totalExtraPay)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <IconGift className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </div>

              <div className="p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Total Deductions
                    </p>
                    <p className="text-2xl font-bold mt-1 text-red-600">
                      −PKR {fmt(summary.totalDeductions)}
                    </p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-red-100 flex items-center justify-center">
                    <IconAlertTriangle className="h-5 w-5 text-red-600" />
                  </div>
                </div>
              </div>

              {summary.totalRemaining !== 0 && (
                <div className="p-4 border rounded-lg bg-card hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total Carry-over
                      </p>
                      <p
                        className={`text-2xl font-bold mt-1 ${summary.totalRemaining >= 0 ? "text-violet-600" : "text-orange-600"}`}
                      >
                        {summary.totalRemaining >= 0 ? "+" : "−"}PKR{" "}
                        {fmt(Math.abs(summary.totalRemaining))}
                      </p>
                    </div>
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center ${summary.totalRemaining >= 0 ? "bg-violet-100" : "bg-orange-100"}`}
                    >
                      <IconArrowsExchange
                        className={`h-5 w-5 ${summary.totalRemaining >= 0 ? "text-violet-600" : "text-orange-600"}`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <IconLoader className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <IconCash className="h-10 w-10 opacity-30" />
          <p className="text-sm">
            {isAdmin
              ? "No payroll records found for this month"
              : "No payroll records found"}
          </p>
          {isAdmin && (
            <Button
              variant="link"
              size="sm"
              onClick={handleRecalculateAll}
              disabled={recalculating}
            >
              Generate payroll for all users
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                {isAdmin && <TableHead>Employee</TableHead>}
                <TableHead>Month / Period</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Worked</TableHead>
                <TableHead>Diff</TableHead>
                <TableHead>Base Salary</TableHead>
                <TableHead>Extra Pay</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Final Salary</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-20" />}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => {
                const diff = parseFloat(r.diff_minutes);
                const isExpanded = expandedId === r.id;
                const netPerDay = r.daily_work_minutes - r.break_minutes;
                const workDeduction = parseFloat(r.work_deduction ?? "0");
                const breakDeduction = parseFloat(r.break_deduction ?? "0");
                const totalDeduction = parseFloat(r.deduction);
                const extraPay = parseFloat(r.extra_pay);
                const remainingAmt = parseFloat(r.remaining_amount || "0");
                const per_minute_rateVal = parseFloat(r.per_minute_rate);
                const info = monthInfo(r.month);
                const bufferAvailable = r.beneficiary_minutes ?? 0;
                // Absence count derived from working_days vs attendance days
                // (not stored on record, so we approximate from diff/net_per_day)
                // actual_minutes already includes excused days, so we can't derive
                // absence_count perfectly here — but we can check extra_pay === 0
                // AND diff > 0 as the signal that extra pay was forfeited.
                const extraPayForfeited =
                  parseFloat(r.extra_pay) === 0 &&
                  parseFloat(r.diff_minutes) > 0;

                // Salary step values for expanded breakdown
                const excusedSalaryValue =
                  r.excused_days > 0
                    ? r.excused_days * netPerDay * per_minute_rateVal
                    : 0;
                const salaryBeforeExcused =
                  parseFloat(r.final_salary) -
                  excusedSalaryValue -
                  remainingAmt;

                const breakOvertimeMinutes = deductionToMinutes(
                  r.break_deduction,
                  r.per_minute_rate,
                );
                const totalAllowedBreaks = calculateTotalAllowedBreaks(
                  r.working_days,
                  r.break_minutes,
                  r.break_minutes_friday,
                );

                const hasBreakDeduction = breakOvertimeMinutes > 0;
                const breakCreditMinutes =
                  !hasBreakDeduction && diff > 0
                    ? Math.min(diff, totalAllowedBreaks)
                    : 0;

                return (
                  <>
                    <TableRow
                      key={r.id}
                      className="hover:bg-muted/30 cursor-pointer select-none"
                      onClick={(e) => {
                        // Don't toggle if clicking on action buttons
                        const target = e.target as HTMLElement;
                        if (target.closest("button")) return;
                        setExpandedId(isExpanded ? null : r.id);
                      }}
                    >
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage src={r.userAvatar ?? undefined} />
                              <AvatarFallback className="text-[9px] bg-blue-600 text-white">
                                {r.userName ? initials(r.userName) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                {r.userName}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize">
                                {r.userRole?.toLowerCase().replace(/_/g, " ")}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                      )}

                      <TableCell>
                        <p className="text-sm font-medium">{info.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {info.period}
                        </p>
                        <p className="text-[10px] text-green-600">
                          Pay: {info.paymentDate}
                        </p>
                      </TableCell>

                      <TableCell className="text-sm font-mono">
                        {fmtMinutesAbs(r.expected_minutes)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {fmtMinutesAbs(r.actual_minutes)}
                      </TableCell>

                      <TableCell>
                        <span
                          className={`text-sm font-mono font-medium ${
                            diff > 0
                              ? "text-green-600"
                              : diff < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                          }`}
                        >
                          {fmtMinutes(r.diff_minutes)}
                        </span>
                      </TableCell>

                      <TableCell className="text-sm font-mono">
                        PKR {fmt(r.base_salary)}
                      </TableCell>

                      <TableCell>
                        {extraPay > 0 ? (
                          <span className="text-xs font-medium text-green-600">
                            +PKR {fmt(r.extra_pay)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        {totalDeduction > 0 ? (
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-red-600">
                              −PKR {fmt(r.deduction)}
                            </div>
                            {(workDeduction > 0 || breakDeduction > 0) && (
                              <div className="space-y-0.5 mt-1">
                                {workDeduction > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] text-orange-600">
                                    <IconClock className="h-2.5 w-2.5 shrink-0" />
                                    <span>Work: PKR {fmt(workDeduction)}</span>
                                  </div>
                                )}
                                {breakDeduction > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] text-purple-600">
                                    <IconCoffee className="h-2.5 w-2.5 shrink-0" />
                                    <span>
                                      Break: PKR {fmt(breakDeduction)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className="text-sm font-bold">
                          PKR {fmt(r.final_salary)}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${STATUS_STYLE[r.status] ?? ""}`}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>

                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditRec(r);
                              }}
                            >
                              <IconEdit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteId(r.id);
                              }}
                            >
                              <IconTrash className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}

                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExpanded ? null : r.id);
                          }}
                        >
                          {isExpanded ? (
                            <IconChevronUp className="h-4 w-4" />
                          ) : (
                            <IconChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow
                        key={`${r.id}-expanded`}
                        className="bg-muted/10"
                      >
                        <TableCell colSpan={isAdmin ? 12 : 10} className="p-0">
                          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
                            {/* ── Salary Calculation ── */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Salary Calculation
                              </p>

                              {/* Period info */}
                              <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs space-y-1 mb-2">
                                <div className="flex justify-between">
                                  <span className="text-blue-600 flex items-center gap-1">
                                    <IconCalendar className="h-3 w-3" />{" "}
                                    Attendance period
                                  </span>
                                  <span className="font-medium text-blue-700">
                                    {info.period}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-green-600">
                                    💰 Payment date
                                  </span>
                                  <span className="font-medium text-green-700">
                                    {info.paymentDate}
                                  </span>
                                </div>
                              </div>

                              {/* Raw metrics */}
                              {[
                                {
                                  label: "Working Days",
                                  value: `${r.working_days} days`,
                                },
                                {
                                  label: "Daily Work",
                                  value: fmtMinutesAbs(r.daily_work_minutes),
                                },
                                {
                                  label: "Expected Minutes",
                                  value: fmtMinutesAbs(r.expected_minutes),
                                },
                                {
                                  label: "Actual Worked",
                                  value: fmtMinutesAbs(r.actual_minutes),
                                },
                                {
                                  label: "Difference",
                                  value: fmtMinutes(r.diff_minutes),
                                },
                                {
                                  label: "Per Minute Rate",
                                  value: `PKR ${fmt(r.per_minute_rate, 4)}`,
                                },
                              ].map(({ label, value }) => (
                                <div
                                  key={label}
                                  className="flex justify-between text-sm"
                                >
                                  <span className="text-muted-foreground">
                                    {label}
                                  </span>
                                  <span className="font-medium font-mono">
                                    {value}
                                  </span>
                                </div>
                              ))}

                              <Separator className="my-2" />

                              {/* ── MINUTES BREAKDOWN ── */}
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Minutes
                              </p>

                              {(() => {
                                const rawWorkedMins =
                                  r.excused_days > 0
                                    ? parseFloat(r.actual_minutes) -
                                      r.excused_days * netPerDay
                                    : parseFloat(r.actual_minutes);
                                const excusedMins = r.excused_days * netPerDay;
                                const totalMins = parseFloat(r.actual_minutes);
                                return (
                                  <>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">
                                        Actual Work Minutes
                                      </span>
                                      <span className="font-medium font-mono">
                                        {fmtMinutesAbs(rawWorkedMins)}
                                      </span>
                                    </div>

                                    {r.excused_days > 0 && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-amber-600 flex items-center gap-1">
                                          <IconCalendarOff className="h-3 w-3" />
                                          Excused Minutes ({r.excused_days}d ×{" "}
                                          {fmtMinutesAbs(netPerDay)})
                                        </span>
                                        <span className="font-medium font-mono text-amber-600">
                                          +{fmtMinutesAbs(excusedMins)}
                                        </span>
                                      </div>
                                    )}

                                    {r.excused_days > 0 && (
                                      <div className="flex justify-between text-sm font-semibold border-t border-dashed pt-1.5 mt-0.5">
                                        <span className="text-foreground">
                                          Total Minutes
                                        </span>
                                        <span className="font-mono">
                                          {fmtMinutesAbs(totalMins)}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}

                              <Separator className="my-2" />

                              {/* ── AMOUNT BREAKDOWN ── */}
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Amount
                              </p>

                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Base Salary
                                </span>
                                <span className="font-medium font-mono">
                                  PKR {fmt(r.base_salary)}
                                </span>
                              </div>

                              {extraPay > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-green-600 flex items-center gap-1">
                                    <IconTrendingUp className="h-3 w-3" />
                                    Extra Pay (overtime)
                                  </span>
                                  <span className="font-medium font-mono text-green-600">
                                    +PKR {fmt(r.extra_pay)}
                                  </span>
                                </div>
                              )}

                              {totalDeduction > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-red-600 flex items-center gap-1">
                                    <IconTrendingDown className="h-3 w-3" />
                                    Total Deduction
                                  </span>
                                  <span className="font-medium font-mono text-red-600">
                                    −PKR {fmt(r.deduction)}
                                  </span>
                                </div>
                              )}

                              <div className="flex justify-between text-sm font-semibold border-t border-dashed pt-1.5 mt-0.5">
                                <span className="text-foreground">
                                  Actual Work Salary
                                </span>
                                <span className="font-mono">
                                  PKR {fmt(salaryBeforeExcused)}
                                </span>
                              </div>

                              {r.excused_days > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-amber-600 flex items-center gap-1">
                                    <IconCalendarOff className="h-3 w-3" />
                                    Excused Pay ({r.excused_days}d ×{" "}
                                    {fmtMinutesAbs(netPerDay)})
                                  </span>
                                  <span className="font-medium font-mono text-amber-600">
                                    +PKR {fmt(excusedSalaryValue)}
                                  </span>
                                </div>
                              )}

                              {r.excused_days > 0 && (
                                <div className="flex justify-between text-sm font-semibold border-t border-dashed pt-1.5 mt-0.5">
                                  <span className="text-foreground">
                                    Salary After Excused
                                  </span>
                                  <span className="font-mono">
                                    PKR{" "}
                                    {fmt(
                                      salaryBeforeExcused + excusedSalaryValue,
                                    )}
                                  </span>
                                </div>
                              )}

                              {remainingAmt !== 0 && (
                                <div className="flex justify-between text-sm">
                                  <span
                                    className={`flex items-center gap-1 ${remainingAmt > 0 ? "text-violet-600" : "text-orange-600"}`}
                                  >
                                    <IconArrowsExchange className="h-3 w-3" />
                                    Carry-over{" "}
                                    {remainingAmt > 0
                                      ? "(credit)"
                                      : "(deduction)"}
                                  </span>
                                  <span
                                    className={`font-medium font-mono ${remainingAmt > 0 ? "text-violet-600" : "text-orange-600"}`}
                                  >
                                    {remainingAmt > 0 ? "+" : "−"}PKR{" "}
                                    {fmt(Math.abs(remainingAmt))}
                                  </span>
                                </div>
                              )}

                              <Separator className="my-1" />
                              <div className="font-bold text-base flex justify-between border border-border rounded-md px-3 py-2 bg-muted/30">
                                <span>Final Salary</span>
                                <span className="text-green-700">
                                  PKR {fmt(r.final_salary)}
                                </span>
                              </div>
                            </div>

                            {/* ── Break & Beneficiary Details ── */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Break & Beneficiary Details
                              </p>

                              <div className="p-3 rounded-lg border bg-card space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                  <IconCoffee className="h-4 w-4 text-purple-500" />
                                  <p className="text-sm font-semibold">
                                    Break Summary
                                  </p>
                                </div>

                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Allowed (month)
                                    </span>
                                    <span className="font-medium">
                                      {fmtMinutesAbs(totalAllowedBreaks)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      Overtime
                                    </span>
                                    <span
                                      className={`font-medium ${breakOvertimeMinutes > 0 ? "text-red-600" : "text-muted-foreground"}`}
                                    >
                                      {breakOvertimeMinutes > 0
                                        ? `−${breakOvertimeMinutes}m`
                                        : "0m"}
                                    </span>
                                  </div>
                                  {breakCreditMinutes > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        Credit (no break)
                                      </span>
                                      <span className="font-medium text-emerald-600">
                                        +{breakCreditMinutes}m
                                      </span>
                                    </div>
                                  )}
                                  <Separator className="my-1" />
                                  <div className="flex justify-between font-medium">
                                    <span>Net Impact</span>
                                    <span
                                      className={
                                        breakOvertimeMinutes > 0
                                          ? "text-red-600"
                                          : breakCreditMinutes > 0
                                            ? "text-emerald-600"
                                            : "text-muted-foreground"
                                      }
                                    >
                                      {breakOvertimeMinutes > 0
                                        ? `−${breakOvertimeMinutes}m`
                                        : breakCreditMinutes > 0
                                          ? `+${breakCreditMinutes}m`
                                          : "0m"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {bufferAvailable > 0 ? (
                                <div className="p-3 rounded-lg border bg-card space-y-2">
                                  <div className="flex items-center gap-2 mb-2">
                                    <IconGift className="h-4 w-4 text-purple-500" />
                                    <p className="text-sm font-semibold">
                                      Beneficiary Buffer
                                    </p>
                                  </div>

                                  {(() => {
                                    const workShortage =
                                      diff < 0 ? Math.abs(diff) : 0;
                                    const manualMins =
                                      r.manual_deduction_minutes ?? 0;
                                    const bufUsedWork = Math.min(
                                      bufferAvailable,
                                      workShortage,
                                    );
                                    const bufAfterWork = Math.max(
                                      0,
                                      bufferAvailable - bufUsedWork,
                                    );
                                    const bufUsedBreak = Math.min(
                                      bufAfterWork,
                                      breakOvertimeMinutes,
                                    );
                                    const bufAfterBreak = Math.max(
                                      0,
                                      bufAfterWork - bufUsedBreak,
                                    );
                                    const bufUsedManual = Math.min(
                                      bufAfterBreak,
                                      manualMins,
                                    );
                                    const totalBufUsed =
                                      bufUsedWork +
                                      bufUsedBreak +
                                      bufUsedManual;
                                    const bufRemaining = Math.max(
                                      0,
                                      bufferAvailable - totalBufUsed,
                                    );
                                    const pct =
                                      bufferAvailable > 0
                                        ? Math.min(
                                            100,
                                            (totalBufUsed / bufferAvailable) *
                                              100,
                                          )
                                        : 0;
                                    return (
                                      <div className="space-y-2 text-xs">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">
                                            Available
                                          </span>
                                          <span className="font-medium">
                                            {bufferAvailable}m
                                          </span>
                                        </div>
                                        {bufUsedWork > 0 && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">
                                              Used for work shortage
                                            </span>
                                            <span className="font-medium text-orange-600">
                                              −{bufUsedWork}m
                                            </span>
                                          </div>
                                        )}
                                        {bufUsedBreak > 0 && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">
                                              Used for break overtime
                                            </span>
                                            <span className="font-medium text-purple-600">
                                              −{bufUsedBreak}m
                                            </span>
                                          </div>
                                        )}
                                        {bufUsedManual > 0 && (
                                          <div className="flex justify-between">
                                            <span className="text-muted-foreground">
                                              Used for manual deduction
                                            </span>
                                            <span className="font-medium text-red-600">
                                              −{bufUsedManual}m
                                            </span>
                                          </div>
                                        )}
                                        {totalBufUsed > 0 && (
                                          <div className="flex justify-between font-medium border-t pt-1">
                                            <span className="text-muted-foreground">
                                              Remaining
                                            </span>
                                            <span>{bufRemaining}m</span>
                                          </div>
                                        )}
                                        <Progress value={pct} className="h-2" />
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                          {totalBufUsed === 0
                                            ? "No deductions — buffer not used"
                                            : `Buffer absorbed ${totalBufUsed}m of deductions`}
                                        </p>
                                      </div>
                                    );
                                  })()}
                                </div>
                              ) : (
                                <div className="p-3 rounded-lg border border-muted bg-muted/20 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <IconGift className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <p className="text-sm font-semibold text-muted-foreground">
                                      No Buffer Configured
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    Beneficiary buffer is set globally in{" "}
                                    <strong>
                                      Attendance → Office Configuration
                                    </strong>
                                    .
                                  </p>
                                </div>
                              )}

                              {extraPayForfeited && (
                                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <IconAlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                                    <p className="text-sm font-semibold text-amber-700">
                                      Extra Pay Forfeited
                                    </p>
                                  </div>
                                  <p className="text-xs text-amber-600">
                                    Overtime pay is not awarded when an employee
                                    has 2 or more absences in the month, even if
                                    extra hours were worked.
                                  </p>
                                </div>
                              )}

                              {remainingAmt !== 0 && (
                                <div className="p-3 rounded-lg border bg-card space-y-2">
                                  <div className="flex items-center gap-2 mb-2">
                                    <IconArrowsExchange
                                      className={`h-4 w-4 ${remainingAmt > 0 ? "text-violet-500" : "text-orange-500"}`}
                                    />
                                    <p className="text-sm font-semibold">
                                      Carry-over Amount
                                    </p>
                                  </div>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        Amount
                                      </span>
                                      <span
                                        className={`font-bold ${remainingAmt > 0 ? "text-violet-600" : "text-orange-600"}`}
                                      >
                                        {remainingAmt > 0 ? "+" : "−"}PKR{" "}
                                        {fmt(Math.abs(remainingAmt))}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">
                                        Effect
                                      </span>
                                      <span className="font-medium">
                                        {remainingAmt > 0
                                          ? "Added to salary"
                                          : "Deducted from salary"}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground pt-1">
                                      {remainingAmt > 0
                                        ? "Previous balance owed to employee — carried forward"
                                        : "Previous overpayment or advance — recovered this month"}
                                    </p>
                                  </div>
                                </div>
                              )}

                              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
                                <p className="font-semibold flex items-center gap-1">
                                  <IconInfoCircle className="h-3 w-3" />
                                  How this works
                                </p>
                                <ul className="list-disc list-inside space-y-0.5 text-blue-700/80">
                                  <li>
                                    Break overtime is deducted from salary
                                  </li>
                                  <li>
                                    Skipping breaks adds time to worked hours
                                  </li>
                                  <li>
                                    Buffer forfeited if any absence this month
                                  </li>
                                  <li>Excused days are paid at full rate</li>
                                  <li>
                                    2+ absences forfeit all overtime/extra pay
                                  </li>
                                  <li>
                                    Buffer absorbs: work shortage → break
                                    overtime → manual deduction
                                  </li>
                                  <li>
                                    Carry-over adjusts for previous month
                                    balances
                                  </li>
                                </ul>
                              </div>
                            </div>

                            {/* ── Deduction Breakdown ── */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Deduction Breakdown
                              </p>
                              {totalDeduction === 0 ? (
                                <div className="flex items-center justify-center py-6 text-sm text-green-600 flex-col gap-2">
                                  <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
                                    <IconCash className="h-5 w-5" />
                                  </div>
                                  No deductions this month
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex justify-between text-sm font-bold">
                                    <span className="text-red-600">
                                      Total Deduction
                                    </span>
                                    <span className="text-red-600 font-mono">
                                      −PKR {fmt(r.deduction)}
                                    </span>
                                  </div>
                                  <Separator />
                                  <div className="p-3 rounded-lg border border-orange-200 bg-orange-50 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <IconClock className="h-4 w-4 text-orange-600 shrink-0" />
                                      <p className="text-xs font-semibold text-orange-700">
                                        Work Time Deduction
                                      </p>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground text-xs">
                                        Worked fewer hours than expected
                                      </span>
                                      <span
                                        className={`font-bold font-mono text-sm ${workDeduction > 0 ? "text-orange-600" : "text-muted-foreground"}`}
                                      >
                                        {workDeduction > 0
                                          ? `−PKR ${fmt(workDeduction)}`
                                          : "—"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="p-3 rounded-lg border border-purple-200 bg-purple-50 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <IconCoffee className="h-4 w-4 text-purple-600 shrink-0" />
                                      <p className="text-xs font-semibold text-purple-700">
                                        Break Overtime Deduction
                                      </p>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground text-xs">
                                        Exceeded allowed break time
                                      </span>
                                      <span
                                        className={`font-bold font-mono text-sm ${breakDeduction > 0 ? "text-purple-600" : "text-muted-foreground"}`}
                                      >
                                        {breakDeduction > 0
                                          ? `−PKR ${fmt(breakDeduction)}`
                                          : "—"}
                                      </span>
                                    </div>
                                  </div>
                                  {(r.manual_deduction_minutes ?? 0) > 0 && (
                                    <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <IconScissors className="h-4 w-4 text-red-600 shrink-0" />
                                        <p className="text-xs font-semibold text-red-700">
                                          Manual Deduction
                                        </p>
                                      </div>
                                      {(() => {
                                        const grossMins =
                                          r.manual_deduction_minutes ?? 0;
                                        const rate = parseFloat(
                                          r.per_minute_rate,
                                        );
                                        const grossAmt = grossMins * rate;
                                        const netAmt = parseFloat(
                                          r.manual_deduction ?? "0",
                                        );
                                        const bufAbsorbed = Math.max(
                                          0,
                                          grossAmt - netAmt,
                                        );
                                        const bufAbsorbedMins =
                                          rate > 0
                                            ? Math.round(bufAbsorbed / rate)
                                            : 0;
                                        return (
                                          <div className="space-y-1 text-xs">
                                            <div className="flex justify-between">
                                              <span className="text-muted-foreground">
                                                Gross ({grossMins}m × PKR{" "}
                                                {fmt(r.per_minute_rate, 4)})
                                              </span>
                                              <span className="font-mono text-red-500">
                                                PKR {fmt(grossAmt)}
                                              </span>
                                            </div>
                                            {bufAbsorbed > 0.005 && (
                                              <div className="flex justify-between">
                                                <span className="text-muted-foreground">
                                                  Buffer absorbed (
                                                  {bufAbsorbedMins}m)
                                                </span>
                                                <span className="font-mono text-purple-600">
                                                  −PKR {fmt(bufAbsorbed)}
                                                </span>
                                              </div>
                                            )}
                                            <div className="flex justify-between font-semibold border-t border-red-200 pt-1 mt-0.5">
                                              <span className="text-red-700">
                                                Net deducted
                                                {bufAbsorbed > 0.005
                                                  ? " (after buffer)"
                                                  : ""}
                                              </span>
                                              <span className="font-mono text-red-700">
                                                −PKR {fmt(netAmt)}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Bank Info */}
                              <div className="space-y-2 pt-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1 mb-3">
                                  <IconBuildingBank className="h-3.5 w-3.5" />
                                  Bank Information
                                </p>
                                {[
                                  { label: "Bank Name", value: r.bankName },
                                  {
                                    label: "Account Number",
                                    value: r.bankAccountNumber,
                                  },
                                  {
                                    label: "Account Title",
                                    value: r.bankAccountTitle,
                                  },
                                ].map(({ label, value }) => (
                                  <div key={label}>
                                    <p className="text-xs text-muted-foreground">
                                      {label}
                                    </p>
                                    <p className="text-sm font-medium font-mono">
                                      {value ?? (
                                        <span className="italic text-muted-foreground not-italic font-normal">
                                          Not set
                                        </span>
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              <div className="space-y-2 pt-1">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                  Notes
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {r.notes ?? "No notes"}
                                </p>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Edit Dialog ── */}
      {editRec && isAdmin && (
        <Dialog open onOpenChange={() => setEditRec(null)}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Edit Payroll Record</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{editRec.userName}</p>
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-blue-600 flex items-center gap-1">
                      <IconCalendar className="h-3 w-3" /> Attendance period
                    </span>
                    <span className="font-medium text-blue-700">
                      {monthInfo(editRec.month).period}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">💰 Payment due</span>
                    <span className="font-medium text-green-700">
                      {monthInfo(editRec.month).paymentDate}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
                <div className="flex items-center gap-2">
                  <IconCalendarOff className="h-4 w-4 text-amber-600" />
                  <Label className="text-xs font-semibold text-amber-700">
                    Approved Paid Leave (Excused Days)
                  </Label>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={editRec.working_days}
                  value={editRec.excused_days}
                  onChange={(e) =>
                    setEditRec({
                      ...editRec,
                      excused_days: Number(e.target.value),
                    })
                  }
                  className="text-sm h-8 border-amber-300"
                  placeholder="0"
                />
                <p className="text-[10px] text-amber-600">
                  Each excused day adds back{" "}
                  <strong>
                    {fmtMinutesAbs(
                      editRec.daily_work_minutes - editRec.break_minutes,
                    )}
                  </strong>{" "}
                  to worked time. Salary auto-recalculates on save.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-violet-200 bg-violet-50 space-y-2">
                <div className="flex items-center gap-2">
                  <IconArrowsExchange className="h-4 w-4 text-violet-600" />
                  <Label className="text-xs font-semibold text-violet-700">
                    Carry-over Amount (PKR)
                  </Label>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  value={editRec.remaining_amount ?? "0"}
                  onChange={(e) =>
                    setEditRec({
                      ...editRec,
                      remaining_amount: e.target.value,
                    })
                  }
                  className="text-sm h-8 border-violet-300"
                  placeholder="0.00"
                />
                <p className="text-[10px] text-violet-600">
                  Positive = credit from previous month (adds to salary).
                  Negative = advance or overpayment recovery (deducts). Salary
                  auto-recalculates on save.
                </p>
              </div>

              <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-2">
                <div className="flex items-center gap-2">
                  <IconScissors className="h-4 w-4 text-red-600" />
                  <Label className="text-xs font-semibold text-red-700">
                    Manual Minute Deduction
                  </Label>
                </div>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={editRec.manual_deduction_minutes ?? 0}
                  onChange={(e) =>
                    setEditRec({
                      ...editRec,
                      manual_deduction_minutes: Math.max(
                        0,
                        parseInt(e.target.value) || 0,
                      ),
                    })
                  }
                  className="text-sm h-8 border-red-300"
                  placeholder="0"
                />
                {(() => {
                  const grossMins = editRec.manual_deduction_minutes ?? 0;
                  const rate = parseFloat(editRec.per_minute_rate);
                  const buffer = editRec.beneficiary_minutes ?? 0;
                  const bufferAbsorbs = Math.min(buffer, grossMins);
                  const netMins = Math.max(0, grossMins - bufferAbsorbs);
                  const grossAmt = grossMins * rate;
                  const netAmt = netMins * rate;
                  const fmtAmt = (v: number) =>
                    v.toLocaleString("en-PK", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    });
                  return (
                    <div className="text-[10px] space-y-1 pt-1">
                      <div className="flex justify-between text-red-600">
                        <span>
                          Gross: {grossMins}m × PKR {rate.toFixed(4)}
                        </span>
                        <span className="font-medium">
                          PKR {fmtAmt(grossAmt)}
                        </span>
                      </div>
                      {bufferAbsorbs > 0 && (
                        <div className="flex justify-between text-purple-600">
                          <span>Buffer absorbs: {bufferAbsorbs}m</span>
                          <span className="font-medium">
                            −PKR {fmtAmt(bufferAbsorbs * rate)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex justify-between font-semibold border-t pt-1 ${netAmt > 0 ? "text-red-700" : "text-green-700"}`}
                      >
                        <span>
                          Net deduction
                          {bufferAbsorbs > 0 ? " (after buffer)" : ""}
                        </span>
                        <span>PKR {fmtAmt(netAmt)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(editRec.beneficiary_minutes ?? 0) > 0 && (
                <div className="p-3 rounded-lg border border-purple-200 bg-purple-50 text-xs text-purple-800 flex items-center gap-2">
                  <IconGift className="h-4 w-4 text-purple-600 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Beneficiary Buffer: {editRec.beneficiary_minutes}m
                    </p>
                    <p className="text-purple-600/80 mt-0.5">
                      Set globally in{" "}
                      <strong>Attendance → Office Configuration</strong>.
                      Forfeited if employee has any absences.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={editRec.status}
                  onValueChange={(v) => setEditRec({ ...editRec, status: v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CALCULATED">Calculated</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={editRec.notes ?? ""}
                  onChange={(e) =>
                    setEditRec({ ...editRec, notes: e.target.value })
                  }
                  rows={2}
                  className="resize-none text-sm"
                  placeholder="e.g. 3 days excused — Eid leave approved"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditRec(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving}
                className="gap-2"
              >
                {saving ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  "Save & Recalculate"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Delete Payroll Record</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-2">
            This will permanently delete this payroll record. This cannot be
            undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteId(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
