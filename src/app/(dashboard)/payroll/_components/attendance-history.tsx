"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  IconLoader,
  IconCalendar,
  IconChevronDown,
  IconUser,
  IconUsers,
  IconTrendingUp,
} from "@tabler/icons-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttendanceDay {
  id: string;
  user_id: string;
  date: string;
  check_in: string;
  check_out: string | null;
  total_hours: string | null;
  status: "PRESENT" | "HALF_DAY" | "ABSENT";
  notes: string | null;
  userName?: string | null;
  userAvatar?: string | null;
  userRole?: string | null;
  synthetic?: boolean; // true = absent day generated on the client
}

interface PayrollRecord {
  id: string;
  month: string;
  base_salary: string;
  per_minute_rate: string;
  working_days: number;
  expected_minutes: number;
  actual_minutes: string;
  final_salary: string;
  excused_days: number;
}

interface MonthSummary {
  month: string;
  label: string;
  days: AttendanceDay[];
  presentDays: number;
  halfDays: number;
  absentDays: number;
  totalHours: number;
  payroll: PayrollRecord | null;
}

interface UserOption {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  role: string;
}

interface Props {
  isAdmin: boolean;
  isTeamLeader?: boolean;
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function monthLabel(yyyyMM: string) {
  if (!yyyyMM || yyyyMM.length < 7) return "Invalid Date";
  const date = new Date(yyyyMM + "-01T00:00:00");
  if (isNaN(date.getTime())) return "Invalid Date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

function formatTime(dt: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Karachi",
    });
  } catch {
    return "—";
  }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

function fmtHours(h: number) {
  if (isNaN(h)) return "0h";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function fmtPKR(amount: number) {
  if (isNaN(amount)) return "PKR —";
  return `PKR ${amount.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLE: Record<string, string> = {
  PRESENT:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  HALF_DAY:
    "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
  ABSENT:
    "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

function statusLabel(s: string) {
  if (s === "HALF_DAY") return "Half Day";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function calcDayEarning(
  totalHours: string | null,
  perMinuteRate: string | null,
): number | null {
  if (!totalHours || !perMinuteRate) return null;
  const hours = parseFloat(totalHours);
  const rate = parseFloat(perMinuteRate);
  if (isNaN(hours) || isNaN(rate) || rate <= 0) return null;
  return hours * 60 * rate;
}

/**
 * Generate synthetic absent-day entries for all working days in a month
 * that have no attendance row. Skips Sundays and the last Saturday.
 */
function generateAbsentDays(
  month: string, // "YYYY-MM"
  existingDates: Set<string>,
  userId: string,
): AttendanceDay[] {
  const [year, mo] = month.split("-").map(Number);
  if (!year || !mo) return [];

  const daysInMonth = new Date(year, mo, 0).getDate();

  // Find last Saturday
  let lastSat = -1;
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, mo - 1, d).getDay() === 6) {
      lastSat = d;
      break;
    }
  }

  const absent: AttendanceDay[] = [];
  const today = new Date().toISOString().split("T")[0];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dateStr > today) continue; // don't show future days as absent
    const dow = new Date(year, mo - 1, d).getDay(); // 0=Sun
    if (dow === 0) continue; // Sunday — off
    if (dow === 6 && d === lastSat) continue; // last Saturday — off
    if (existingDates.has(dateStr)) continue; // already has a row

    absent.push({
      id: `synthetic-absent-${dateStr}`,
      user_id: userId,
      date: dateStr,
      check_in: "",
      check_out: null,
      total_hours: null,
      status: "ABSENT",
      notes: null,
      synthetic: true,
    });
  }
  return absent;
}

function groupByMonth(
  days: AttendanceDay[],
  payrollMap: Map<string, PayrollRecord>,
  userId: string,
  injectAbsent: boolean,
): MonthSummary[] {
  const map = new Map<string, AttendanceDay[]>();
  for (const day of days) {
    if (!day.date || day.date.length < 7) continue;
    const month = day.date.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(day);
  }

  const summaries: MonthSummary[] = [];
  for (const [month, entries] of map.entries()) {
    let allEntries = entries;

    if (injectAbsent) {
      // Build set of dates that already have rows
      const existing = new Set(entries.map((e) => e.date));
      const absentDays = generateAbsentDays(month, existing, userId);
      allEntries = [...entries, ...absentDays];
    }

    const sorted = [...allEntries].sort((a, b) => b.date.localeCompare(a.date));
    const totalHours = allEntries
      .filter((d) => d.status !== "ABSENT")
      .reduce((sum, d) => sum + parseFloat(String(d.total_hours ?? 0)), 0);

    const payroll = payrollMap.get(month) ?? null;

    summaries.push({
      month,
      label: monthLabel(month),
      days: sorted,
      presentDays: allEntries.filter((d) => d.status === "PRESENT").length,
      halfDays: allEntries.filter((d) => d.status === "HALF_DAY").length,
      absentDays: allEntries.filter((d) => d.status === "ABSENT").length,
      totalHours,
      payroll,
    });
  }
  return summaries.sort((a, b) => b.month.localeCompare(a.month));
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchAttendanceRecords(
  params: Record<string, string>,
): Promise<AttendanceDay[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`/api/attendance/history?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch attendance");
  const data = await res.json();
  return data.records ?? [];
}

async function fetchPayrollRecords(userId: string): Promise<PayrollRecord[]> {
  const res = await fetch(`/api/payroll?userId=${userId}&_t=${Date.now()}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.records ?? [];
}

// ── Hook: seed first month open ───────────────────────────────────────────────
function useExpandedMonths(records: AttendanceDay[]) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    if (records.length > 0 && !seeded.current) {
      seeded.current = true;
      setTimeout(() => setExpanded(new Set([records[0].date.slice(0, 7)])), 0);
    }
  }, [records]);

  const toggle = useCallback(
    (month: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        next.has(month) ? next.delete(month) : next.add(month);
        return next;
      }),
    [],
  );

  return { expanded, toggle };
}

// ── Month Accordion ───────────────────────────────────────────────────────────

function MonthAccordion({
  grouped,
  showEmployeeCol,
  showEarnings,
  userId,
  expanded,
  onToggle,
}: {
  grouped: MonthSummary[];
  showEmployeeCol: boolean;
  showEarnings: boolean;
  userId: string;
  expanded: Set<string>;
  onToggle: (m: string) => void;
}) {
  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2 bg-muted/10 rounded-lg border border-dashed">
        <IconCalendar className="h-12 w-12 opacity-20" />
        <p className="text-sm font-medium">No attendance records found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map((summary) => {
        const isOpen = expanded.has(summary.month);
        const pr = summary.payroll;
        const perMinuteRate = pr ? parseFloat(pr.per_minute_rate) : null;

        const totalEarned =
          perMinuteRate !== null
            ? summary.days
                .filter((d) => d.status !== "ABSENT")
                .reduce(
                  (sum, d) =>
                    sum +
                    parseFloat(String(d.total_hours ?? 0)) * 60 * perMinuteRate,
                  0,
                )
            : null;

        return (
          <Collapsible
            key={summary.month}
            open={isOpen}
            onOpenChange={() => onToggle(summary.month)}
            className="border rounded-lg overflow-hidden bg-card"
          >
            <CollapsibleTrigger asChild>
              <button className="w-full text-left hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      <IconCalendar className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-base font-bold leading-tight">
                        {summary.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {summary.days.length} days
                        {showEarnings && pr && (
                          <span className="ml-1 text-emerald-600 font-medium">
                            · {fmtPKR(parseFloat(pr.final_salary))}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-1 mr-2">
                      {summary.presentDays > 0 && (
                        <Badge
                          variant="secondary"
                          className="bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          {summary.presentDays} P
                        </Badge>
                      )}
                      {summary.halfDays > 0 && (
                        <Badge
                          variant="secondary"
                          className="bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                        >
                          {summary.halfDays} H
                        </Badge>
                      )}
                      {summary.absentDays > 0 && (
                        <Badge
                          variant="secondary"
                          className="bg-red-50 text-red-700 hover:bg-red-100"
                        >
                          {summary.absentDays} A
                        </Badge>
                      )}
                    </div>
                    <div
                      className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    >
                      <IconChevronDown className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border-t bg-muted/10 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      {showEmployeeCol && (
                        <TableHead className="w-[200px]">Employee</TableHead>
                      )}
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Check In</TableHead>
                      <TableHead>Check Out</TableHead>
                      <TableHead>Hours</TableHead>
                      {showEarnings && perMinuteRate !== null && (
                        <TableHead>
                          <span className="flex items-center gap-1">
                            <IconTrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                            Day Earning
                          </span>
                        </TableHead>
                      )}
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.days.map((day) => {
                      const dayEarning =
                        showEarnings &&
                        perMinuteRate !== null &&
                        day.status !== "ABSENT"
                          ? calcDayEarning(
                              day.total_hours,
                              pr?.per_minute_rate ?? null,
                            )
                          : null;

                      const isAbsent = day.status === "ABSENT";

                      return (
                        <TableRow
                          key={day.id}
                          className={`transition-colors ${isAbsent ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/60" : "hover:bg-muted/30"}`}
                        >
                          {showEmployeeCol && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage
                                    src={day.userAvatar ?? undefined}
                                  />
                                  <AvatarFallback className="text-[8px]">
                                    {day.userName
                                      ? initials(day.userName)
                                      : "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col leading-none">
                                  <span className="text-xs font-semibold">
                                    {day.userName ?? "Unknown"}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {day.userRole?.replace(/_/g, " ")}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                          )}
                          <TableCell
                            className={`font-medium whitespace-nowrap ${isAbsent ? "text-red-600 dark:text-red-400" : ""}`}
                          >
                            {formatDate(day.date)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`${STATUS_STYLE[day.status] ?? ""} font-normal`}
                            >
                              {statusLabel(day.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {isAbsent ? (
                              <span className="text-red-400">—</span>
                            ) : (
                              formatTime(day.check_in)
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {isAbsent ? (
                              <span className="text-red-400">—</span>
                            ) : (
                              formatTime(day.check_out)
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold">
                            {isAbsent ? (
                              <span className="text-red-400 font-normal">
                                —
                              </span>
                            ) : day.total_hours ? (
                              fmtHours(parseFloat(day.total_hours))
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          {showEarnings && perMinuteRate !== null && (
                            <TableCell>
                              {isAbsent ? (
                                <span className="text-xs text-red-400">−</span>
                              ) : dayEarning !== null ? (
                                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 font-mono">
                                  {fmtPKR(dayEarning)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  —
                                </span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                            {isAbsent ? (
                              <span className="text-red-400 italic text-[10px]">
                                Absent
                              </span>
                            ) : (
                              day.notes || <span className="opacity-30">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>

                  {/* Footer — totals */}
                  {showEarnings &&
                    perMinuteRate !== null &&
                    totalEarned !== null && (
                      <tfoot>
                        <tr className="border-t-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20">
                          <td
                            colSpan={showEmployeeCol ? 6 : 5}
                            className="px-4 py-2.5 text-right"
                          >
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                              Total Earned from Attendance
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                              {fmtPKR(totalEarned)}
                            </span>
                          </td>
                          <td />
                        </tr>
                        {pr &&
                          Math.abs(parseFloat(pr.final_salary) - totalEarned) >
                            0.5 && (
                            <tr className="bg-emerald-50/30 dark:bg-emerald-950/10">
                              <td
                                colSpan={showEmployeeCol ? 6 : 5}
                                className="px-4 py-2 text-right"
                              >
                                <span className="text-xs text-muted-foreground">
                                  Final Salary (incl. excused days, deductions,
                                  carry-over)
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-sm font-bold text-green-700 dark:text-green-400 font-mono">
                                  {fmtPKR(parseFloat(pr.final_salary))}
                                </span>
                              </td>
                              <td />
                            </tr>
                          )}
                      </tfoot>
                    )}
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
      <IconLoader className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-medium">Loading attendance records…</p>
    </div>
  );
}

// ── Hook: fetch attendance + payroll for a single user ────────────────────────

function useUserAttendanceWithPayroll(userId: string | null) {
  // Derive initial loading from userId so no setState needed in effect for null case
  const [state, setState] = useState<{
    days: AttendanceDay[];
    payrollMap: Map<string, PayrollRecord>;
    loading: boolean;
    forUserId: string | null;
  }>({ days: [], payrollMap: new Map(), loading: !!userId, forUserId: userId });

  // When userId changes to null, reset synchronously via derived state
  // (computed during render, not inside an effect)
  const effectiveState =
    userId === null
      ? {
          days: [] as AttendanceDay[],
          payrollMap: new Map<string, PayrollRecord>(),
          loading: false,
        }
      : state.forUserId !== userId
        ? {
            days: [] as AttendanceDay[],
            payrollMap: new Map<string, PayrollRecord>(),
            loading: true,
          }
        : state;

  useEffect(() => {
    if (!userId) return; // nothing to fetch — state is reset by render logic above

    let cancelled = false;

    Promise.all([
      fetchAttendanceRecords({ userId }),
      fetchPayrollRecords(userId),
    ])
      .then(([attendanceRecords, payrollRecords]) => {
        if (cancelled) return;
        const map = new Map<string, PayrollRecord>();
        for (const pr of payrollRecords) {
          map.set(String(pr.month).slice(0, 7), pr);
        }
        setState({
          days: attendanceRecords,
          payrollMap: map,
          loading: false,
          forUserId: userId,
        });
      })
      .catch(() => {
        if (!cancelled)
          setState({
            days: [],
            payrollMap: new Map(),
            loading: false,
            forUserId: userId,
          });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return {
    days: effectiveState.days,
    payrollMap: effectiveState.payrollMap,
    loading: effectiveState.loading,
  };
}

// ── My Attendance ─────────────────────────────────────────────────────────────

function MyAttendanceView({ userId }: { userId: string }) {
  const { days, payrollMap, loading } = useUserAttendanceWithPayroll(userId);
  const { expanded, toggle } = useExpandedMonths(days);

  if (loading) return <LoadingState />;
  return (
    <MonthAccordion
      grouped={groupByMonth(days, payrollMap, userId, true)}
      showEmployeeCol={false}
      showEarnings={true}
      userId={userId}
      expanded={expanded}
      onToggle={toggle}
    />
  );
}

// ── Admin view ────────────────────────────────────────────────────────────────

function AdminAttendanceView({ userId: _userId }: { userId: string }) {
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("all");

  const singleUserId = selectedUser !== "all" ? selectedUser : null;
  const {
    days: singleDays,
    payrollMap,
    loading: singleLoading,
  } = useUserAttendanceWithPayroll(singleUserId);

  const [allState, setAllState] = useState<{
    days: AttendanceDay[];
    loading: boolean;
  }>({ days: [], loading: false });

  const { expanded, toggle } = useExpandedMonths(
    selectedUser === "all" ? allState.days : singleDays,
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users?active=true")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUserOptions(data.users ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedUser !== "all") return;
    let cancelled = false;
    fetchAttendanceRecords({})
      .then((r) => {
        if (!cancelled) setAllState({ days: r, loading: false });
      })
      .catch(() => {
        if (!cancelled) setAllState({ days: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  const loading = selectedUser === "all" ? allState.loading : singleLoading;
  const days = selectedUser === "all" ? allState.days : singleDays;
  const emptyMap = new Map<string, PayrollRecord>();
  const injectAbsent = selectedUser !== "all";
  const grouped = groupByMonth(
    days,
    selectedUser === "all" ? emptyMap : payrollMap,
    selectedUser,
    injectAbsent,
  );
  const selectedUserObj =
    selectedUser !== "all"
      ? userOptions.find((u) => u.id === selectedUser)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconCalendar className="h-4 w-4" />
          <span>
            {selectedUser === "all"
              ? "Viewing attendance for ALL employees"
              : "Viewing full attendance (including absences) for selected employee"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Filter by Employee:
          </Label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="w-full sm:w-[240px] h-9">
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <IconUser className="h-4 w-4" /> All Employees
                </div>
              </SelectItem>
              {userOptions.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={u.avatar ?? undefined} />
                      <AvatarFallback className="text-[8px]">
                        {initials(u.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate max-w-[150px]">{u.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedUserObj && (
        <div className="flex items-center gap-3 px-4 py-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 animate-in fade-in slide-in-from-top-2">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-white dark:ring-gray-900">
            <AvatarImage src={selectedUserObj.avatar ?? undefined} />
            <AvatarFallback className="text-sm bg-blue-600 text-white">
              {initials(selectedUserObj.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold leading-none">
              {selectedUserObj.name}
            </p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              @{selectedUserObj.username} ·{" "}
              {selectedUserObj.role.toLowerCase().replace(/_/g, " ")}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
              {grouped.length} Month{grouped.length !== 1 ? "s" : ""}
            </p>
            <p className="text-[10px] text-muted-foreground">History Found</p>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <MonthAccordion
          grouped={grouped}
          showEmployeeCol={selectedUser === "all"}
          showEarnings={selectedUser !== "all"}
          userId={selectedUser}
          expanded={expanded}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

// ── Team Attendance ───────────────────────────────────────────────────────────

function TeamAttendanceView({
  leaderId,
  teamMembers,
  loadingMembers,
}: {
  leaderId: string;
  teamMembers: UserOption[];
  loadingMembers: boolean;
}) {
  const [selectedMember, setSelectedMember] = useState<string>("all");

  const singleUserId = selectedMember !== "all" ? selectedMember : null;
  const {
    days: singleDays,
    payrollMap,
    loading: singleLoading,
  } = useUserAttendanceWithPayroll(singleUserId);

  const [allState, setAllState] = useState<{
    days: AttendanceDay[];
    loading: boolean;
  }>({ days: [], loading: false });

  const { expanded, toggle } = useExpandedMonths(
    selectedMember === "all" ? allState.days : singleDays,
  );

  useEffect(() => {
    if (selectedMember !== "all") return;
    let cancelled = false;
    fetchAttendanceRecords({})
      .then((r) => {
        if (!cancelled) setAllState({ days: r, loading: false });
      })
      .catch(() => {
        if (!cancelled) setAllState({ days: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMember]);

  const loading = selectedMember === "all" ? allState.loading : singleLoading;
  const days = selectedMember === "all" ? allState.days : singleDays;
  const emptyMap = new Map<string, PayrollRecord>();
  const injectAbsent = selectedMember !== "all";
  const grouped = groupByMonth(
    days,
    selectedMember === "all" ? emptyMap : payrollMap,
    selectedMember,
    injectAbsent,
  );
  const selectedObj =
    selectedMember !== "all"
      ? teamMembers.find((u) => u.id === selectedMember)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconUsers className="h-4 w-4" />
          <span>
            {selectedMember === "all"
              ? "Viewing attendance for your entire team"
              : "Viewing full attendance (including absences) for team member"}
          </span>
        </div>
        {loadingMembers ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <IconLoader className="h-4 w-4 animate-spin" /> Loading team…
          </div>
        ) : teamMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No team members found.
          </p>
        ) : (
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              Team member:
            </Label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="w-full sm:w-[220px] h-9">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <IconUsers className="h-4 w-4" />
                    Entire Team
                  </div>
                </SelectItem>
                {teamMembers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={u.avatar ?? undefined} />
                        <AvatarFallback className="text-[8px]">
                          {initials(u.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[140px]">{u.name}</span>
                      {u.id === leaderId && (
                        <span className="text-[10px] text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {selectedObj && (
        <div className="flex items-center gap-3 px-4 py-3 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-white dark:ring-gray-900">
            <AvatarImage src={selectedObj.avatar ?? undefined} />
            <AvatarFallback className="text-sm bg-blue-600 text-white">
              {initials(selectedObj.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold leading-none">
              {selectedObj.name}
            </p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              @{selectedObj.username} ·{" "}
              {selectedObj.role.toLowerCase().replace(/_/g, " ")}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <MonthAccordion
          grouped={grouped}
          showEmployeeCol={selectedMember === "all"}
          showEarnings={selectedMember !== "all"}
          userId={selectedMember}
          expanded={expanded}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

// ── Team Leader wrapper ───────────────────────────────────────────────────────

function TeamLeaderAttendanceView({ userId }: { userId: string }) {
  const [teamMembers, setTeamMembers] = useState<UserOption[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users?teamOf=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setTeamMembers(data.users ?? []);
      })
      .catch(() => {
        if (!cancelled) setTeamMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine" className="gap-2">
          <IconUser className="h-4 w-4" />
          My Attendance
        </TabsTrigger>
        <TabsTrigger value="team" className="gap-2">
          <IconUsers className="h-4 w-4" />
          My Team
          {!loadingMembers && teamMembers.length > 0 && (
            <span className="ml-1 text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
              {teamMembers.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mine" className="mt-4">
        <MyAttendanceView userId={userId} />
      </TabsContent>
      <TabsContent value="team" className="mt-4">
        <TeamAttendanceView
          leaderId={userId}
          teamMembers={teamMembers}
          loadingMembers={loadingMembers}
        />
      </TabsContent>
    </Tabs>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AttendanceHistory({
  isAdmin,
  isTeamLeader = false,
  userId,
}: Props) {
  if (isAdmin) return <AdminAttendanceView userId={userId} />;
  if (isTeamLeader) return <TeamLeaderAttendanceView userId={userId} />;
  return <MyAttendanceView userId={userId} />;
}
