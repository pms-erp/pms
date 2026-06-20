// app/(dashboard)/payroll/_components/payroll-config.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import {
  IconLoader,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSettings,
  IconAlertTriangle,
  IconInfoCircle,
  IconCalendar,
} from "@tabler/icons-react";

interface Config {
  id: string;
  month: string;
  working_days: number;
  daily_work_minutes: number;
  notes: string | null;
}

interface Props {
  onConfigSaved?: () => void;
}

const EMPTY_FORM = {
  month: "",
  working_days: 0,
  daily_work_minutes: 510,
  notes: "",
};

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMinutes(mins: number) {
  return `${Math.round(mins).toLocaleString("en-PK")}m`;
}

function monthLabel(m: string | null | undefined) {
  if (!m || typeof m !== "string") return "Invalid Date";
  let normalized = m;
  if (m.includes("-")) {
    const parts = m.split("-");
    if (parts.length === 3) normalized = `${parts[0]}-${parts[1]}`;
  }
  const date = new Date(`${normalized}-01T00:00:00`);
  if (isNaN(date.getTime())) return "Invalid Date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function cycleInfo(yearMonthStr: string) {
  if (!yearMonthStr) return null;
  const [y, mo] = yearMonthStr.split("-").map(Number);
  if (!y || !mo) return null;

  const periodEnd = new Date(y, mo, 1);
  const payDate = new Date(y, mo, 5);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return {
    attendanceStart: `${yearMonthStr}-01`,
    attendanceEnd: fmt(periodEnd),
    paymentDate: fmt(payDate),
  };
}

interface WorkingDaysInfo {
  workingDays: number;
  totalMonSat: number;
  lastSaturdayDate: number;
  sundays: number;
}

function calcWorkingDays(yearMonthStr: string): WorkingDaysInfo {
  if (!yearMonthStr)
    return { workingDays: 0, totalMonSat: 0, lastSaturdayDate: -1, sundays: 0 };
  const [year, month] = yearMonthStr.split("-").map(Number);
  if (!year || !month)
    return { workingDays: 0, totalMonSat: 0, lastSaturdayDate: -1, sundays: 0 };

  const m = month - 1;
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  let lastSaturdayDate = -1;
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, m, d).getDay() === 6) {
      lastSaturdayDate = d;
      break;
    }
  }

  let workingDays = 0,
    totalMonSat = 0,
    sundays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, m, d).getDay();
    if (dow === 0) {
      sundays++;
      continue;
    }
    totalMonSat++;
    if (dow === 6 && d === lastSaturdayDate) continue;
    workingDays++;
  }

  return { workingDays, totalMonSat, lastSaturdayDate, sundays };
}

/**
 * Calculate net expected minutes — mirrors payroll-calculator.ts exactly.
 * Iterates calendar working days in order, takes the first `working_days`
 * of them, and applies per-day break deductions (Friday = 60m, others = 30m).
 *
 * This means: if working_days = 21 but calendar has 25 workable days, only
 * the first 21 days' break patterns are used — matching the server calc.
 */
function calcNetExpectedMinutes(
  yearMonthStr: string,
  workingDays: number,
  dailyWorkMinutes: number,
): number {
  if (!yearMonthStr || workingDays <= 0 || dailyWorkMinutes <= 0) return 0;

  const parts = yearMonthStr.slice(0, 7).split("-").map(Number);
  const year = parts[0];
  const month = parts[1] - 1; // 0-indexed
  if (!year || isNaN(month)) return 0;

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Find last Saturday (off day)
  let lastSat = -1;
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, month, d).getDay() === 6) {
      lastSat = d;
      break;
    }
  }

  // Collect calendar working day-of-weeks in order (same as payroll-calculator.ts)
  const calendarDows: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    // Use PKT noon to match server (avoids DST edge cases)
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const pktDate = new Date(`${dateStr}T12:00:00+05:00`);
    const dow = pktDate.getUTCDay();
    if (dow === 0) continue; // skip Sunday
    if (dow === 6 && d === lastSat) continue; // skip last Saturday
    calendarDows.push(dow);
  }

  // Take only the first `workingDays` entries — matches server slice
  const effectiveDows = calendarDows.slice(
    0,
    Math.min(workingDays, calendarDows.length),
  );

  // Sum net minutes per day
  let total = 0;
  for (const dow of effectiveDows) {
    const breakMins = dow === 5 ? 60 : 30; // Friday = 60m break
    total += dailyWorkMinutes - breakMins;
  }

  return total;
}

export function PayrollConfig({ onConfigSaved }: Props) {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const wdInfo = calcWorkingDays(form.month);
  const cycle = cycleInfo(form.month);
  const previewNetMinutes = calcNetExpectedMinutes(
    form.month,
    form.working_days,
    form.daily_work_minutes,
  );

  async function fetchConfigs(bustCache = false) {
    setLoading(true);
    try {
      const url = bustCache
        ? `/api/payroll/config?_t=${Date.now()}`
        : "/api/payroll/config";
      const data = await fetch(url).then((r) => r.json());
      setConfigs(data.configs ?? []);
    } catch (err) {
      console.error("Failed to fetch configs:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchConfigs();
  }, []);

  function openCreate() {
    const month = currentMonthStr();
    const wdInfo = calcWorkingDays(month);
    setForm({ ...EMPTY_FORM, month, working_days: wdInfo.workingDays });
    setShowForm(true);
  }

  function openEdit(c: Config) {
    setForm({
      month: c.month.slice(0, 7),
      working_days: c.working_days,
      daily_work_minutes: c.daily_work_minutes,
      notes: c.notes ?? "",
    });
    setShowForm(true);
  }

  function handleMonthChange(val: string) {
    const info = calcWorkingDays(val);
    setForm((f) => ({ ...f, month: val, working_days: info.workingDays }));
  }

  async function handleSave() {
    if (!form.month) {
      toast.error("Select a month");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, month: `${form.month}-01` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");

      toast.success(data.message ?? "Config saved and payroll recalculated");
      setShowForm(false);
      fetchConfigs(true);
      if (onConfigSaved) onConfigSaved();
    } catch (err) {
      console.error("Save error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payroll/config?id=${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Config deleted");
      setDeleteId(null);
      fetchConfigs();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconSettings className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Monthly Work Configuration</p>
        </div>
        <Button size="sm" className="gap-2 h-8" onClick={openCreate}>
          <IconPlus className="h-4 w-4" /> Add Config
        </Button>
      </div>

      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="p-4 text-sm text-blue-700 dark:text-blue-400 space-y-1">
          <p className="font-medium">How salary is calculated</p>
          <p>Expected minutes = Working Days × Daily Work Minutes</p>
          <p>Per Minute Rate = Base Salary ÷ Expected Minutes</p>
          <p>
            Final Salary = Base Salary + Extra Pay − Work Deduction − Break
            Deduction
          </p>
          <p className="pt-1 border-t border-blue-200 dark:border-blue-700 mt-1">
            📅 <strong>Attendance period:</strong> 1st of month → 1st of next
            month
          </p>
          <p>
            💰 <strong>Salary payment:</strong> 5th of the following month
          </p>
          <p className="mt-1 text-amber-700 dark:text-amber-400 font-medium">
            ⚡ Saving config automatically recalculates payroll for ALL users
          </p>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2.5 p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm text-violet-800">
        <IconCalendar className="h-4 w-4 shrink-0 mt-0.5 text-violet-500" />
        <div>
          <p className="font-medium">Office Work Schedule</p>
          <div className="text-violet-700/80 text-xs mt-1 space-y-0.5">
            <p>
              • <strong>Mon – Thu + Sat:</strong> Full working day, standard
              break
            </p>
            <p>
              • <strong>Friday:</strong> Full working day, extended break
              (Jumu`ah)
            </p>
            <p>
              • <strong>Last Saturday of each month:</strong> Off
            </p>
            <p>
              • <strong>Sunday:</strong> Always off
            </p>
          </div>
          <p className="text-violet-600/70 text-xs mt-1.5">
            Working days auto-calculated when you select a month.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800">
        <IconInfoCircle className="h-4 w-4 shrink-0 mt-0.5 text-teal-500" />
        <div>
          <p className="font-medium">Break time is managed separately</p>
          <p className="text-teal-700/80 text-xs mt-0.5">
            Break duration and grace period are configured in{" "}
            <span className="font-semibold">
              Attendance → Office Configuration
            </span>
            . Break overtime deductions are tracked separately in the payroll
            breakdown.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <IconLoader className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <IconSettings className="h-10 w-10 opacity-30" />
          <p className="text-sm">No configs yet. Add one for each month.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Month / Period</TableHead>
                <TableHead>Working Days</TableHead>
                <TableHead>Daily Work</TableHead>
                <TableHead>Total Expected</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((c) => {
                // Use the same function as the form preview — respects working_days count
                const netExpectedMinutes = calcNetExpectedMinutes(
                  c.month.slice(0, 7),
                  c.working_days,
                  c.daily_work_minutes,
                );
                const monthStr = c.month.slice(0, 7);
                const cycleDates = cycleInfo(monthStr);

                return (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell>
                      <p className="text-sm font-medium">
                        {monthLabel(c.month)}
                      </p>
                      {cycleDates && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {cycleDates.attendanceStart} →{" "}
                          {cycleDates.attendanceEnd}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.working_days} days
                    </TableCell>
                    <TableCell className="text-sm">
                      {fmtMinutes(c.daily_work_minutes)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {fmtMinutes(netExpectedMinutes)}
                      <span className="text-[10px] text-muted-foreground ml-1">
                        (net)
                      </span>
                    </TableCell>
                    <TableCell>
                      {cycleDates && (
                        <span className="text-xs font-medium text-green-600">
                          {cycleDates.paymentDate}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                      {c.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(c)}
                        >
                          <IconEdit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(c.id)}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Monthly Work Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Month <span className="text-destructive">*</span>
              </Label>
              <Input
                type="month"
                value={form.month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="text-sm"
              />
            </div>

            {form.month && cycle && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs space-y-1.5">
                <p className="font-semibold text-blue-700 mb-0.5">
                  Payroll Cycle
                </p>
                <div className="flex justify-between">
                  <span className="text-blue-600 flex items-center gap-1">
                    <IconCalendar className="h-3 w-3" /> Attendance period
                  </span>
                  <span className="font-medium text-blue-700">
                    {cycle.attendanceStart} → {cycle.attendanceEnd}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">💰 Payment date</span>
                  <span className="font-bold text-green-700">
                    {cycle.paymentDate}
                  </span>
                </div>
              </div>
            )}

            {form.month && wdInfo.workingDays > 0 && (
              <div className="p-3 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-800 space-y-1">
                <p className="font-semibold text-violet-700">
                  Auto-calculated for {monthLabel(form.month)}
                </p>
                <div className="flex justify-between">
                  <span>Total Mon–Sat days</span>
                  <span className="font-medium">{wdInfo.totalMonSat} days</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Last Saturday off (
                    {wdInfo.lastSaturdayDate > 0
                      ? `${form.month}-${String(wdInfo.lastSaturdayDate).padStart(2, "0")}`
                      : "none"}
                    )
                  </span>
                  <span className="font-medium text-red-600">− 1 day</span>
                </div>
                <div className="flex justify-between border-t border-violet-200 pt-1">
                  <span className="font-semibold">Working Days</span>
                  <span className="font-bold text-violet-700">
                    {wdInfo.workingDays} days
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">
                Working Days
                <span className="ml-1 text-muted-foreground font-normal">
                  (auto-calculated — reduce for public holidays)
                </span>
              </Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.working_days}
                onChange={(e) =>
                  setForm({ ...form, working_days: Number(e.target.value) })
                }
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Daily Work (minutes)</Label>
              <Input
                type="number"
                min={60}
                max={720}
                value={form.daily_work_minutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    daily_work_minutes: Number(e.target.value),
                  })
                }
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                = {fmtMinutes(form.daily_work_minutes)}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border text-sm space-y-1">
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-2">
                Preview
              </p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Gross expected / month
                </span>
                <span className="font-medium">
                  {fmtMinutes(form.working_days * form.daily_work_minutes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Net expected (after breaks)
                </span>
                <span className="font-bold text-primary">
                  {fmtMinutes(previewNetMinutes)}
                </span>
              </div>

              <p className="text-[10px] text-muted-foreground pt-1 border-t">
                Net = gross minus break time (30m/day, 60m on Fridays). Matches
                exactly what the payroll calculator uses.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Eid holiday — 2 additional days off deducted"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForm(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" /> Saving &
                  Recalculating…
                </>
              ) : (
                "Save & Recalculate All"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <DialogTitle>Delete Config</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground pt-2">
            This will delete the monthly work config. Existing payroll records
            won&apos;t be affected.
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
