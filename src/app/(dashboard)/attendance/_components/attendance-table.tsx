"use client";

import { useEffect, useState, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  IconLoader,
  IconEdit,
  IconChevronDown,
  IconCalendar,
  IconGridDots,
  IconPlus,
  IconCoffee,
  IconAlertTriangle,
  IconTrash,
  IconClock,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  notes: string | null;
  userName: string | null;
  userAvatar: string | null;
  userRole: string | null;
  break_minutes?: number | null;
  break_overtime?: number | null;
  break_count?: number;
}

interface BreakSession {
  id: string;
  attendance_id: string;
  break_start: string;
  break_end: string | null;
  actual_minutes: number | null;
  allowed_minutes: number;
  overtime_minutes: number | null;
}

interface UserOption {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  role: string;
}

interface OfficeConfig {
  break_minutes_default: number;
  break_minutes_friday: number;
  break_grace_minutes: number;
  break_start_time?: string;
  break_start_time_friday?: string | null;
}

interface Props {
  userId: string | null;
  showUserColumn: boolean;
  canManage: boolean;
  refreshKey: number;
  teamLeaderId?: string;
  externalMonth?: string; // NEW: "YYYY-MM" — drives from/to internally
  externalFrom?: string; // kept for backward compat (ignored when externalMonth set)
  externalTo?: string;
}

interface RawBreakSession {
  id: string;
  attendance_id: string;
  break_start: string | null;
  break_end: string | null;
  actual_minutes: string | number | null;
  allowed_minutes: number | null;
  overtime_minutes: string | number | null;
}

// ─── PKT Timezone Helpers ────────────────────────────────────────────────────

function utcToPKTNaive(utcIso: string): string {
  const d = new Date(utcIso);
  const pktStr = d
    .toLocaleString("sv-SE", { timeZone: "Asia/Karachi", hour12: false })
    .replace(" ", "T");
  return pktStr.slice(0, 16);
}

function utcToPKTTimeOnly(utcString: string): string {
  if (!utcString) return "";
  try {
    const date = new Date(utcString);
    if (isNaN(date.getTime())) return "";
    const timeStr = date.toLocaleString("sv-SE", {
      timeZone: "Asia/Karachi",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const match = timeStr.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "";
  } catch {
    return "";
  }
}

function pktNaiveToUTC(naivePKT: string): string {
  return new Date(`${naivePKT}:00+05:00`).toISOString();
}

function formatPKTTime(utcIso: string | null): string {
  if (!utcIso) return "—";
  return new Date(utcIso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });
}

function formatDateLong(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getPKTDateStr(date: Date): string {
  return date
    .toLocaleString("sv-SE", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");
}

function currentMonthPKT(): string {
  const pkt = getPKTDateStr(new Date());
  return pkt.slice(0, 7); // "YYYY-MM"
}

/** Convert "YYYY-MM" → { from: "YYYY-MM-01", to: "YYYY-MM-DD" } */
function monthToRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function createPKTMidnight(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+05:00`);
}

function getPKTDayOfWeek(dateStr: string): number {
  const date = new Date(`${dateStr}T12:00:00+05:00`);
  return date.getUTCDay();
}

function isPKTSunday(dateStr: string): boolean {
  return getPKTDayOfWeek(dateStr) === 0;
}

// ─── Status Styles ───────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  PRESENT: "bg-green-100 text-green-700 border-green-200",
  HALF_DAY: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ABSENT: "bg-red-100 text-red-700 border-red-200",
  HOLIDAY: "bg-purple-100 text-purple-700 border-purple-200",
};

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  HALF_DAY: "Half Day",
  ABSENT: "Absent",
  HOLIDAY: "Holiday",
};

// ─── Break Helpers ────────────────────────────────────────────────────────────

function getBreakMinutesForDateConfig(
  dateStr: string,
  config: OfficeConfig | null,
): number {
  if (!config) return 30;
  const dayOfWeek = getPKTDayOfWeek(dateStr);
  return dayOfWeek === 5
    ? (config.break_minutes_friday ?? 60)
    : (config.break_minutes_default ?? 30);
}

function calculateNetHoursWithBreak(
  checkInUTC: string,
  checkOutUTC: string,
  dateStr: string,
  officeConfig: OfficeConfig | null,
): number {
  const grossMs =
    new Date(checkOutUTC).getTime() - new Date(checkInUTC).getTime();
  const breakMinutes = getBreakMinutesForDateConfig(dateStr, officeConfig);
  const breakMs = breakMinutes * 60 * 1000;
  const netMs = Math.max(0, grossMs - breakMs);
  return parseFloat((netMs / 3_600_000).toFixed(2));
}

function getImpliedBreakMinutes(r: AttendanceRecord): number | null {
  if (!r.check_in || !r.check_out || !r.total_hours) return null;
  const grossMins =
    (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000;
  const workedMins = parseFloat(r.total_hours) * 60;
  if (!isFinite(grossMins) || !isFinite(workedMins)) return null;
  const implied = Math.round(grossMins - workedMins);
  return implied > 0 ? implied : null;
}

function getDisplayBreakMinutes(r: AttendanceRecord): {
  minutes: number;
  isImplied: boolean;
} | null {
  if (r.break_minutes !== undefined && r.break_minutes !== null) {
    return { minutes: r.break_minutes, isImplied: false };
  }
  const implied = getImpliedBreakMinutes(r);
  if (implied === null) return null;
  return { minutes: implied, isImplied: true };
}

function formatBreakDuration(
  breakMinutes: number | null | undefined,
  overtime: number | null | undefined,
): string {
  if (breakMinutes == null) return "—";
  const mins = Math.round(breakMinutes);
  const ot = overtime ? Math.round(overtime) : 0;
  if (ot > 0) return `${mins}m (${ot}m over)`;
  return `${mins}m`;
}

function formatWorkingHours(hours: string | null): string {
  if (!hours) return "—";
  const total = parseFloat(hours);
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  return `${h}h ${m}m`;
}

// ─── Fetch Helpers ────────────────────────────────────────────────────────────

async function fetchOfficeConfig(): Promise<OfficeConfig | null> {
  try {
    const res = await fetch("/api/attendance/office-config");
    if (!res.ok) return null;
    const data = await res.json();
    return data.config ?? null;
  } catch {
    return null;
  }
}

async function fetchBreakSessions(
  attendanceId: string,
): Promise<BreakSession[]> {
  try {
    const res = await fetch(
      `/api/attendance/breaks?attendance_id=${attendanceId}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { breaks?: RawBreakSession[] };
    const breaks = data.breaks ?? [];
    return breaks.map((brk) => ({
      id: brk.id,
      attendance_id: brk.attendance_id,
      break_start: brk.break_start ? utcToPKTTimeOnly(brk.break_start) : "",
      break_end: brk.break_end ? utcToPKTTimeOnly(brk.break_end) : "",
      actual_minutes:
        brk.actual_minutes != null
          ? parseFloat(String(brk.actual_minutes))
          : null,
      allowed_minutes: brk.allowed_minutes ?? 0,
      overtime_minutes:
        brk.overtime_minutes != null
          ? parseFloat(String(brk.overtime_minutes))
          : null,
    }));
  } catch {
    return [];
  }
}

function buildImpliedBreakForEdit(
  r: AttendanceRecord,
  officeConfig: OfficeConfig | null,
): BreakSession | null {
  const impliedMins = getImpliedBreakMinutes(r);
  if (impliedMins === null) return null;

  const isFriday = getPKTDayOfWeek(r.date) === 5;
  const allowed = isFriday
    ? (officeConfig?.break_minutes_friday ?? 60)
    : (officeConfig?.break_minutes_default ?? 30);

  const defaultStart = isFriday
    ? officeConfig?.break_start_time_friday ||
      officeConfig?.break_start_time ||
      "14:00"
    : officeConfig?.break_start_time || "14:00";

  const [sh, sm] = defaultStart.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endTotalMins = Math.min(23 * 60 + 59, startMins + impliedMins);
  const eh = String(Math.floor(endTotalMins / 60)).padStart(2, "0");
  const em = String(endTotalMins % 60).padStart(2, "0");
  const defaultEnd = `${eh}:${em}`;

  const grace = officeConfig?.break_grace_minutes ?? 5;
  const overtime = Math.max(0, impliedMins - (allowed + grace));

  return {
    id: `temp-${Date.now()}`,
    attendance_id: r.id,
    break_start: defaultStart,
    break_end: defaultEnd,
    actual_minutes: impliedMins,
    allowed_minutes: allowed,
    overtime_minutes: overtime,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AttendanceTable({
  userId,
  showUserColumn,
  canManage,
  refreshKey,
  teamLeaderId,
  externalMonth,
  externalFrom,
  externalTo,
}: Props) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRec, setEditRec] = useState<AttendanceRecord | null>(null);
  const [editBreaks, setEditBreaks] = useState<BreakSession[]>([]);
  const [editBreaksAreImplied, setEditBreaksAreImplied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [officeConfig, setOfficeConfig] = useState<OfficeConfig | null>(null);

  // ── Month picker state (internal) ──────────────────────────────────────────
  const [activeMonth, setActiveMonth] = useState<string>(
    externalMonth ?? currentMonthPKT(),
  );

  // Derive from/to from the active month
  const { from, to } = useMemo(() => monthToRange(activeMonth), [activeMonth]);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const [addOpen, setAddOpen] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addForm, setAddForm] = useState({
    user_id: "",
    date: "",
    check_in: "09:00",
    check_out: "17:30",
    status: "PRESENT",
    notes: "",
  });
  const [addSaving, setAddSaving] = useState(false);

  // Sync if parent passes externalMonth
  useEffect(() => {
    if (externalMonth) setActiveMonth(externalMonth);
  }, [externalMonth]);

  // Fallback: if parent passes externalFrom/To (old API), derive month from them
  useEffect(() => {
    if (!externalMonth && externalFrom) {
      setActiveMonth(externalFrom.slice(0, 7));
    }
  }, [externalMonth, externalFrom]);

  useEffect(() => {
    setAddForm((f) => ({ ...f, date: getPKTDateStr(new Date()) }));
  }, []);

  useEffect(() => {
    fetchOfficeConfig().then(setOfficeConfig);
  }, []);

  function loadRecords() {
    if (!from || !to) return;
    setLoading(true);
    const qs = new URLSearchParams({ from, to });
    if (userId) qs.set("userId", userId);
    if (teamLeaderId) qs.set("teamLeaderId", teamLeaderId);
    qs.set("includeBreaks", "true");

    fetch(`/api/attendance?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const recordsWithBreaks = (data.records ?? []).map(
          (r: AttendanceRecord) => ({
            ...r,
            break_minutes: r.break_minutes ?? null,
            break_overtime: r.break_overtime ?? null,
            break_count: r.break_count ?? 0,
          }),
        );
        setRecords(recordsWithBreaks);
        setPage(1);
      })
      .catch(() => toast.error("Failed to load attendance"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    async function loadUsers() {
      try {
        setLoadingUsers(true);
        if (showUserColumn || teamLeaderId) {
          let url = "/api/users?active=true";
          if (teamLeaderId)
            url = `/api/users?active=true&teamLeaderId=${teamLeaderId}`;
          const res = await fetch(url);
          const data = await res.json();
          // ✅ Filter out CLIENT users
          const users = (data.users ?? []).filter(
            (u: UserOption) => u.role?.toUpperCase() !== "CLIENT",
          );
          setAllUsers(users);
        } else if (userId) {
          const res = await fetch(`/api/users/${userId}`);
          if (res.ok) {
            const data = await res.json();
            // ✅ Filter out CLIENT users
            if (data.user && data.user.role?.toUpperCase() !== "CLIENT") {
              setAllUsers([data.user]);
            } else {
              setAllUsers([]);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load users:", err);
        setAllUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    }
    if (showUserColumn || teamLeaderId || userId) loadUsers();
  }, [userId, showUserColumn, teamLeaderId]);

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, teamLeaderId, from, to, refreshKey]);

  async function openAddDialog() {
    setAddOpen(true);
    if (allUsers.length > 0) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/users?active=true");
      const data = await res.json();
      // ✅ Filter out CLIENT users
      const users = (data.users ?? []).filter(
        (u: UserOption) => u.role?.toUpperCase() !== "CLIENT",
      );
      setAllUsers(users);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  }

  async function openEditDialog(r: AttendanceRecord) {
    setEditRec({
      ...r,
      check_in: r.check_in ? utcToPKTNaive(r.check_in) : r.check_in,
      check_out: r.check_out ? utcToPKTNaive(r.check_out) : r.check_out,
    });

    if (r.id) {
      const breaks = await fetchBreakSessions(r.id);

      if (breaks.length > 0) {
        setEditBreaks(breaks);
        setEditBreaksAreImplied(false);
      } else {
        const implied = buildImpliedBreakForEdit(r, officeConfig);
        if (implied) {
          setEditBreaks([implied]);
          setEditBreaksAreImplied(true);
        } else {
          setEditBreaks([]);
          setEditBreaksAreImplied(false);
        }
      }
    } else {
      setEditBreaks([]);
      setEditBreaksAreImplied(false);
    }
  }

  function handleTimeChange(field: "check_in" | "check_out", value: string) {
    const updated = { ...addForm, [field]: value };
    if (updated.check_in && updated.check_out && officeConfig && updated.date) {
      const ciUTC = pktNaiveToUTC(`${updated.date}T${updated.check_in}`);
      const coUTC = pktNaiveToUTC(`${updated.date}T${updated.check_out}`);
      const netHours = calculateNetHoursWithBreak(
        ciUTC,
        coUTC,
        updated.date,
        officeConfig,
      );
      updated.status = netHours < 4 ? "HALF_DAY" : "PRESENT";
    }
    setAddForm(updated);
  }

  async function handleAddSave() {
    if (!addForm.user_id) {
      toast.error("Please select an employee");
      return;
    }
    if (!addForm.date) {
      toast.error("Please select a date");
      return;
    }
    if (!addForm.check_in) {
      toast.error("Check-in time is required");
      return;
    }

    const checkInUTC = pktNaiveToUTC(`${addForm.date}T${addForm.check_in}`);
    const checkOutUTC = addForm.check_out
      ? pktNaiveToUTC(`${addForm.date}T${addForm.check_out}`)
      : null;

    let total_hours: number | null = null;
    let status = addForm.status;

    if (checkOutUTC && officeConfig) {
      total_hours = calculateNetHoursWithBreak(
        checkInUTC,
        checkOutUTC,
        addForm.date,
        officeConfig,
      );
      status = total_hours < 4 ? "HALF_DAY" : "PRESENT";
    }

    setAddSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: addForm.user_id,
          date: addForm.date,
          check_in: checkInUTC,
          check_out: checkOutUTC,
          total_hours,
          status,
          notes: addForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      toast.success("Attendance record added");
      setAddOpen(false);
      setAddForm({
        user_id: "",
        date: getPKTDateStr(new Date()),
        check_in: "09:00",
        check_out: "17:30",
        status: "PRESENT",
        notes: "",
      });
      loadRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add record");
    } finally {
      setAddSaving(false);
    }
  }

  function addBreakSession() {
    const isFriday = editRec ? getPKTDayOfWeek(editRec.date) === 5 : false;

    const allowedMins = isFriday
      ? (officeConfig?.break_minutes_friday ?? 60)
      : (officeConfig?.break_minutes_default ?? 30);

    const defaultStart = isFriday
      ? officeConfig?.break_start_time_friday ||
        officeConfig?.break_start_time ||
        "14:00"
      : officeConfig?.break_start_time || "14:00";

    // Compute end time by adding allowedMins to start
    const [sh, sm] = defaultStart.split(":").map(Number);
    const endTotal = sh * 60 + sm + allowedMins;
    const defaultEnd = `${String(Math.floor(endTotal / 60)).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

    const newBreak: BreakSession = {
      id: `temp-${Date.now()}`,
      attendance_id: editRec?.id || "",
      break_start: defaultStart,
      break_end: defaultEnd,
      actual_minutes: allowedMins,
      allowed_minutes: allowedMins,
      overtime_minutes: 0,
    };

    setEditBreaks([...editBreaks, newBreak]);
    setEditBreaksAreImplied(false);
  }

  function updateBreakSession<K extends keyof BreakSession>(
    id: string,
    field: K,
    value: BreakSession[K],
  ) {
    setEditBreaks((breaks) =>
      breaks.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    );
    setEditBreaksAreImplied(false);
  }

  function deleteBreakSession(id: string) {
    setEditBreaks((breaks) => breaks.filter((b) => b.id !== id));
    setEditBreaksAreImplied(false);
  }

  function calculateBreakOvertime(
    actualMinutes: number,
    allowedMinutes: number,
    graceMinutes: number,
  ): number {
    return Math.max(0, actualMinutes - (allowedMinutes + graceMinutes));
  }

  const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  async function handleSaveEdit() {
    if (!editRec) return;

    const checkInBeingCleared =
      !editRec.check_in || editRec.check_in.trim() === "";

    setSaving(true);
    try {
      const checkInUTC = editRec.check_in
        ? pktNaiveToUTC(editRec.check_in.slice(0, 16))
        : null;
      const checkOutUTC = editRec.check_out
        ? pktNaiveToUTC(editRec.check_out.slice(0, 16))
        : null;

      let total_hours: string | null = editRec.total_hours;
      let status = editRec.status;

      if (!checkInBeingCleared && checkInUTC && checkOutUTC && editRec.date) {
        const totalBreakMins = editBreaks.reduce((sum, brk) => {
          if (
            !brk.break_start ||
            !brk.break_end ||
            !isValidTime(brk.break_start) ||
            !isValidTime(brk.break_end)
          ) {
            return sum;
          }
          const sMs = new Date(
            pktNaiveToUTC(`${editRec.date}T${brk.break_start}`),
          ).getTime();
          const eMs = new Date(
            pktNaiveToUTC(`${editRec.date}T${brk.break_end}`),
          ).getTime();
          if (isNaN(sMs) || isNaN(eMs) || eMs <= sMs) return sum;
          return sum + (eMs - sMs) / 60000;
        }, 0);

        const grossMs =
          new Date(checkOutUTC).getTime() - new Date(checkInUTC).getTime();
        const netMs = Math.max(0, grossMs - totalBreakMins * 60_000);
        const netHours = parseFloat((netMs / 3_600_000).toFixed(2));

        total_hours = String(netHours);
        status = netHours < 4 ? "HALF_DAY" : "PRESENT";
      } else if (checkInUTC && !checkOutUTC) {
        total_hours = null;
      }

      const res = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editRec.id,
          check_in: checkInUTC,
          check_out: checkOutUTC,
          total_hours,
          status,
          notes: editRec.notes ?? null,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed to update attendance record");
      }

      const data = await res.json();

      if (data.deleted) {
        toast.success(
          data.message ?? "Record deleted — day now shows as Absent",
        );
        setEditRec(null);
        setEditBreaks([]);
        setEditBreaksAreImplied(false);
        loadRecords();
        return;
      }

      if (editRec.id) {
        const existingBreaks = await fetchBreakSessions(editRec.id);
        const currentIds = new Set(
          editBreaks.filter((b) => !b.id.startsWith("temp-")).map((b) => b.id),
        );

        for (const oldBreak of existingBreaks) {
          if (!currentIds.has(oldBreak.id)) {
            await fetch(`/api/attendance/breaks?id=${oldBreak.id}`, {
              method: "DELETE",
            });
          }
        }

        const graceMinutes = officeConfig?.break_grace_minutes ?? 5;

        for (const brk of editBreaks) {
          const startEmpty = !brk.break_start || brk.break_start.trim() === "";
          const endEmpty = !brk.break_end || brk.break_end.trim() === "";

          if (startEmpty && endEmpty) {
            if (!brk.id.startsWith("temp-")) {
              await fetch(`/api/attendance/breaks?id=${brk.id}`, {
                method: "DELETE",
              });
            }
            continue;
          }

          if (
            !brk.break_start ||
            !brk.break_end ||
            !isValidTime(brk.break_start) ||
            !isValidTime(brk.break_end)
          ) {
            toast.warning(
              `Skipped break with invalid times (${brk.break_start || "—"} → ${
                brk.break_end || "—"
              })`,
            );
            continue;
          }

          let actualMinutes = brk.actual_minutes;
          let overtimeMinutes = brk.overtime_minutes;

          const startUTCStr = pktNaiveToUTC(
            `${editRec.date}T${brk.break_start}`,
          );
          const endUTCStr = pktNaiveToUTC(`${editRec.date}T${brk.break_end}`);
          const startDate = new Date(startUTCStr);
          const endDate = new Date(endUTCStr);

          if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
            actualMinutes = Math.round(
              (endDate.getTime() - startDate.getTime()) / 60000,
            );
            overtimeMinutes = calculateBreakOvertime(
              actualMinutes,
              brk.allowed_minutes,
              graceMinutes,
            );
          }

          const isNew = brk.id.startsWith("temp-");
          const breakPayload = {
            id: isNew ? undefined : brk.id,
            attendance_id: editRec.id,
            user_id: editRec.user_id,
            break_start: brk.break_start,
            break_end: brk.break_end,
            actual_minutes: actualMinutes,
            allowed_minutes: brk.allowed_minutes,
            overtime_minutes: overtimeMinutes,
          };

          await fetch("/api/attendance/breaks", {
            method: isNew ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(breakPayload),
          });
        }
      }

      toast.success("Record updated");
      setEditRec(null);
      setEditBreaks([]);
      setEditBreaksAreImplied(false);
      loadRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  // ── Generate records with HOLIDAY for Sundays ──────────────────────────────
  const recordsWithHolidays = useMemo(() => {
    if (!from || !to) return records;

    let usersToProcess: UserOption[] = [];

    if (showUserColumn || teamLeaderId) {
      usersToProcess = allUsers;
    } else if (userId && allUsers.length > 0) {
      usersToProcess = [allUsers[0]];
    } else if (userId && records.length > 0) {
      const firstRecord = records[0];
      usersToProcess = [
        {
          id: firstRecord.user_id,
          name: firstRecord.userName || "User",
          username: "user",
          avatar: firstRecord.userAvatar,
          role: firstRecord.userRole || "USER",
        },
      ];
    }

    if (usersToProcess.length === 0) return records;

    const existingMap = new Map<string, Map<string, AttendanceRecord>>();
    for (const r of records) {
      if (!existingMap.has(r.date)) existingMap.set(r.date, new Map());
      existingMap.get(r.date)!.set(r.user_id, r);
    }

    const dates: string[] = [];
    const todayPKT = getPKTDateStr(new Date());
    const actualEndDate = to > todayPKT ? todayPKT : to;

    const current = createPKTMidnight(from);
    while (true) {
      const currentPKT = getPKTDateStr(current);
      if (currentPKT > actualEndDate) break;
      dates.push(currentPKT);
      current.setDate(current.getDate() + 1);
    }

    const allRecords: AttendanceRecord[] = [];

    for (const date of dates) {
      for (const user of usersToProcess) {
        const existing = existingMap.get(date)?.get(user.id);
        if (existing) {
          allRecords.push(existing);
        } else if (isPKTSunday(date)) {
          allRecords.push({
            id: `holiday-${date}-${user.id}`,
            user_id: user.id,
            date,
            check_in: null,
            check_out: null,
            total_hours: "0.00",
            status: "HOLIDAY",
            notes: "Sunday - Weekly Holiday",
            userName: user.name,
            userAvatar: user.avatar ?? null,
            userRole: user.role,
            break_minutes: null,
            break_overtime: null,
            break_count: 0,
          });
        } else {
          allRecords.push({
            id: `absent-${date}-${user.id}`,
            user_id: user.id,
            date,
            check_in: null,
            check_out: null,
            total_hours: "0.00",
            status: "ABSENT",
            notes: "No check-in recorded",
            userName: user.name,
            userAvatar: user.avatar ?? null,
            userRole: user.role,
            break_minutes: null,
            break_overtime: null,
            break_count: 0,
          });
        }
      }
    }

    return allRecords;
  }, [records, allUsers, userId, showUserColumn, teamLeaderId, from, to]);

  const filteredRecords = useMemo(() => {
    if (statusFilter === "all") return recordsWithHolidays;
    return recordsWithHolidays.filter((r) => r.status === statusFilter);
  }, [recordsWithHolidays, statusFilter]);

  const recordsByDate = useMemo(() => {
    const grouped: Record<string, AttendanceRecord[]> = {};
    filteredRecords.forEach((r) => {
      if (!grouped[r.date]) grouped[r.date] = [];
      grouped[r.date].push(r);
    });

    const todayPKT = getPKTDateStr(new Date());
    const sortedDates = Object.keys(grouped).sort((a, b) => {
      if (a === todayPKT) return -1;
      if (b === todayPKT) return 1;
      return new Date(b).getTime() - new Date(a).getTime();
    });

    return sortedDates.map(
      (date) => [date, grouped[date]] as [string, AttendanceRecord[]],
    );
  }, [filteredRecords]);

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (recordsByDate.length > 0 && expandedDates.size === 0) {
      setExpandedDates(new Set([recordsByDate[0][0]]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordsByDate.length]);

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const totalPages = Math.ceil(filteredRecords.length / PAGE_SIZE);

  function getDayStats(dayRecords: AttendanceRecord[]) {
    return {
      present: dayRecords.filter((r) => r.status === "PRESENT").length,
      halfDay: dayRecords.filter((r) => r.status === "HALF_DAY").length,
      absent: dayRecords.filter((r) => r.status === "ABSENT").length,
      holiday: dayRecords.filter((r) => r.status === "HOLIDAY").length,
      total: dayRecords.length,
    };
  }

  const isFutureMonth = addMonths(activeMonth, 1) > currentMonthPKT();

  function renderRow(r: AttendanceRecord, dayNumber: number) {
    const isAbsent = r.status === "ABSENT";
    const isHoliday = r.status === "HOLIDAY";

    const displayBreak = getDisplayBreakMinutes(r);
    const isOverLimit = (r.break_overtime ?? 0) > 0;

    return (
      <TableRow
        key={r.id}
        className={`hover:bg-muted/30 ${
          isAbsent ? "bg-red-50/30" : isHoliday ? "bg-purple-50/30" : ""
        }`}
      >
        <TableCell className="w-12 text-center">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {dayNumber}
          </span>
        </TableCell>

        {showUserColumn && (
          <TableCell>
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={r.userAvatar ?? undefined} />
                <AvatarFallback className="text-[9px] bg-blue-600 text-white">
                  {r.userName ? initials(r.userName) : "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{r.userName ?? "—"}</p>
                {r.userRole && (
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {r.userRole.replace(/_/g, " ").toLowerCase()}
                  </p>
                )}
              </div>
            </div>
          </TableCell>
        )}

        <TableCell>
          <span
            className={`text-sm font-mono ${isAbsent || isHoliday ? "text-muted-foreground italic" : ""}`}
          >
            {formatPKTTime(r.check_in)}
          </span>
        </TableCell>
        <TableCell>
          <span
            className={`text-sm font-mono ${isAbsent || isHoliday ? "text-muted-foreground italic" : ""}`}
          >
            {formatPKTTime(r.check_out)}
          </span>
        </TableCell>

        <TableCell>
          <span className="text-sm font-medium font-mono">
            {isAbsent || isHoliday ? "—" : formatWorkingHours(r.total_hours)}
          </span>
        </TableCell>

        <TableCell>
          {displayBreak ? (
            <div className="flex items-center gap-1">
              <IconCoffee
                className={`h-3.5 w-3.5 shrink-0 ${
                  isOverLimit
                    ? "text-amber-600"
                    : displayBreak.isImplied
                      ? "text-muted-foreground/70"
                      : "text-muted-foreground"
                }`}
              />
              <span
                className={`text-sm font-mono ${
                  isOverLimit
                    ? "text-amber-600 font-medium"
                    : displayBreak.isImplied
                      ? "text-muted-foreground"
                      : ""
                }`}
                title={
                  displayBreak.isImplied
                    ? "Estimated from check-in/out and worked hours"
                    : "Tracked break"
                }
              >
                {displayBreak.isImplied ? "~" : ""}
                {formatBreakDuration(displayBreak.minutes, r.break_overtime)}
              </span>
              {isOverLimit && (
                <IconAlertTriangle
                  className="h-3 w-3 text-amber-600"
                  title="Over break limit"
                />
              )}
              {!displayBreak.isImplied &&
                r.break_count &&
                r.break_count > 1 && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">
                    ×{r.break_count}
                  </Badge>
                )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground italic">—</span>
          )}
        </TableCell>

        <TableCell>
          <Badge
            variant="outline"
            className={`text-xs ${STATUS_STYLE[r.status] ?? ""}`}
          >
            {STATUS_LABEL[r.status] ?? r.status}
          </Badge>
        </TableCell>

        {canManage && !isAbsent && !isHoliday && (
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => openEditDialog(r)}
            >
              <IconEdit className="h-3.5 w-3.5" />
            </Button>
          </TableCell>
        )}
        {canManage && isAbsent && (
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground cursor-pointer"
              onClick={() => {
                setAddForm({ ...addForm, user_id: r.user_id, date: r.date });
                setAddOpen(true);
              }}
              title="Add attendance for this employee"
            >
              <IconPlus className="h-3.5 w-3.5" />
            </Button>
          </TableCell>
        )}
        {canManage && isHoliday && (
          <TableCell>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-purple-600 hover:text-purple-700"
                onClick={() => {
                  setAddForm({ ...addForm, user_id: r.user_id, date: r.date });
                  setAddOpen(true);
                }}
                title="Add attendance for this Sunday/Holiday"
              >
                <IconPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TableCell>
        )}
        {!canManage && isHoliday && (
          <TableCell>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <IconCoffee className="h-3.5 w-3.5" />
              Holiday
            </span>
          </TableCell>
        )}
      </TableRow>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Controls Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
        {/* ── Month Picker with Prev/Next ── */}
        <div className="flex items-center gap-1 bg-muted/30 border rounded-lg p-1">
          {/* Previous month */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveMonth((m) => addMonths(m, -1))}
            title="Previous month"
          >
            <IconChevronLeft className="h-4 w-4" />
          </Button>

          {/* Month input */}
          <div className="flex items-center gap-2 px-1">
            <IconCalendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="month"
              value={activeMonth}
              max={currentMonthPKT()}
              onChange={(e) => {
                if (e.target.value) setActiveMonth(e.target.value);
              }}
              className="h-8 rounded-md border-0 bg-transparent px-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring w-[130px]"
            />
          </div>

          {/* Next month — disabled if current or future */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveMonth((m) => addMonths(m, 1))}
            disabled={activeMonth >= currentMonthPKT()}
            title={
              activeMonth >= currentMonthPKT()
                ? "Can't go to a future month"
                : "Next month"
            }
          >
            <IconChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Current month shortcut */}
        {activeMonth !== currentMonthPKT() && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setActiveMonth(currentMonthPKT())}
          >
            <IconCalendar className="h-3.5 w-3.5" /> This Month
          </Button>
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <div className="flex items-center border rounded-md p-0.5 bg-muted/30">
            <Button
              variant="default"
              size="sm"
              className="h-7 px-2.5 text-xs gap-1"
              disabled
            >
              <IconGridDots className="h-3.5 w-3.5" /> Day View
            </Button>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PRESENT">Present</SelectItem>
              <SelectItem value="HALF_DAY">Half Day</SelectItem>
              <SelectItem value="ABSENT">Absent</SelectItem>
              <SelectItem value="HOLIDAY">Holiday</SelectItem>
            </SelectContent>
          </Select>

          {canManage && (
            <Button size="sm" className="h-8 gap-1.5" onClick={openAddDialog}>
              <IconPlus className="h-3.5 w-3.5" /> Add Attendance
            </Button>
          )}
        </div>
      </div>

      {/* Loading / Empty */}
      {loading || (loadingUsers && allUsers.length === 0) ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <IconLoader className="h-5 w-5 animate-spin" /> Loading attendance…
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2 border rounded-lg">
          <IconCalendar className="h-10 w-10 opacity-30" />
          <p className="text-sm">No attendance records for this period</p>
          <p className="text-xs text-muted-foreground">
            Try adjusting the month
          </p>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 gap-1.5"
              onClick={openAddDialog}
            >
              <IconPlus className="h-3.5 w-3.5" /> Add First Record
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recordsByDate.map(([date, dayRecords]) => {
            const stats = getDayStats(dayRecords);
            const isOpen = expandedDates.has(date);

            return (
              <div key={date} className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleDate(date)}
                  aria-expanded={isOpen}
                  className="w-full bg-muted/40 hover:bg-muted/60 transition-colors px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-3">
                    <IconChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                        isOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                    <div>
                      <h3 className="font-semibold text-sm">
                        {formatDateLong(date)}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {stats.total} staff · {stats.present} present ·{" "}
                        {stats.halfDay} half-day · {stats.absent} absent
                        {stats.holiday > 0 && ` · ${stats.holiday} holiday`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant="outline"
                      className="text-xs bg-green-50 border-green-200 text-green-700"
                    >
                      {stats.present} ✓
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs bg-yellow-50 border-yellow-200 text-yellow-700"
                    >
                      {stats.halfDay} ½
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs bg-red-50 border-red-200 text-red-700"
                    >
                      {stats.absent} ✗
                    </Badge>
                    {stats.holiday > 0 && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-purple-50 border-purple-200 text-purple-700"
                      >
                        {stats.holiday} 🏖️
                      </Badge>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/20">
                        <TableHead className="w-12 text-center">#</TableHead>
                        {showUserColumn && <TableHead>Employee</TableHead>}
                        <TableHead>Check In</TableHead>
                        <TableHead>Check Out</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>
                          <span className="flex items-center gap-1">
                            <IconCoffee className="h-3.5 w-3.5" />
                            Break
                          </span>
                        </TableHead>
                        <TableHead>Status</TableHead>
                        {canManage && <TableHead className="w-10" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dayRecords.map((r, idx) => renderRow(r, idx + 1))}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Attendance Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconPlus className="h-4 w-4" /> Add Attendance Record
            </DialogTitle>
            <DialogDescription className="sr-only">
              Manually add an attendance record for an employee, including
              check-in/out times and status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Employee <span className="text-destructive">*</span>
              </Label>
              {loadingUsers ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <IconLoader className="h-4 w-4 animate-spin" /> Loading
                  employees…
                </div>
              ) : (
                <Select
                  value={addForm.user_id}
                  onValueChange={(v) => setAddForm({ ...addForm, user_id: v })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={u.avatar ?? undefined} />
                            <AvatarFallback className="text-[8px]">
                              {initials(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{u.name}</span>
                          <span className="text-muted-foreground text-xs">
                            @{u.username}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={addForm.date}
                max={getPKTDateStr(new Date())}
                onChange={(e) =>
                  setAddForm({ ...addForm, date: e.target.value })
                }
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Future dates are not allowed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Check In <span className="text-destructive">*</span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (PKT)
                  </span>
                </Label>
                <Input
                  type="time"
                  value={addForm.check_in}
                  onChange={(e) => handleTimeChange("check_in", e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  Check Out
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (PKT)
                  </span>
                </Label>
                <Input
                  type="time"
                  value={addForm.check_out}
                  onChange={(e) =>
                    handleTimeChange("check_out", e.target.value)
                  }
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave empty if not checked out
                </p>
              </div>
            </div>

            {addForm.check_in &&
              addForm.check_out &&
              officeConfig &&
              addForm.date && (
                <div className="p-3 rounded-lg bg-muted/40 border text-xs space-y-1">
                  <p className="font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Preview (Net Hours)
                  </p>
                  {(() => {
                    const ciUTC = pktNaiveToUTC(
                      `${addForm.date}T${addForm.check_in}`,
                    );
                    const coUTC = pktNaiveToUTC(
                      `${addForm.date}T${addForm.check_out}`,
                    );
                    const { break_minutes_default, break_minutes_friday } =
                      officeConfig;
                    const isFriday = getPKTDayOfWeek(addForm.date) === 5;
                    const breakMins = isFriday
                      ? break_minutes_friday
                      : break_minutes_default;
                    const netHours = calculateNetHoursWithBreak(
                      ciUTC,
                      coUTC,
                      addForm.date,
                      officeConfig,
                    );
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Gross hours
                          </span>
                          <span className="font-medium">
                            {(
                              (new Date(coUTC).getTime() -
                                new Date(ciUTC).getTime()) /
                              3_600_000
                            ).toFixed(1)}
                            h
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Break ({isFriday ? "Fri" : "Mon–Thu/Sat"})
                          </span>
                          <span className="font-medium text-amber-600">
                            −{breakMins}m
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t">
                          <span className="text-muted-foreground">
                            Net hours
                          </span>
                          <span className="font-bold">
                            {formatWorkingHours(String(netHours))}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_STYLE[netHours < 4 ? "HALF_DAY" : "PRESENT"]}`}
                          >
                            {netHours < 4 ? "Half Day" : "Present"}
                          </Badge>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

            <div className="space-y-1.5">
              <Label className="text-xs">
                Status{" "}
                <span className="ml-1 text-muted-foreground font-normal">
                  (auto-set from times)
                </span>
              </Label>
              <Select
                value={addForm.status}
                onValueChange={(v) => setAddForm({ ...addForm, status: v })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENT">Present</SelectItem>
                  <SelectItem value="HALF_DAY">Half Day</SelectItem>
                  <SelectItem value="ABSENT">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={addForm.notes}
                onChange={(e) =>
                  setAddForm({ ...addForm, notes: e.target.value })
                }
                placeholder="e.g. Added manually — employee forgot to check in"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={addSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSave}
              disabled={addSaving || loadingUsers}
              className="gap-2"
            >
              {addSaving ? (
                <>
                  <IconLoader className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <IconPlus className="h-4 w-4" /> Add Record
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog WITH Break Sessions ── */}
      {editRec && canManage && (
        <Dialog
          open
          onOpenChange={() => {
            setEditRec(null);
            setEditBreaks([]);
            setEditBreaksAreImplied(false);
          }}
        >
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Attendance Record</DialogTitle>
              <DialogDescription className="sr-only">
                Edit check-in, check-out, status, notes, and break sessions for
                this attendance record.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {showUserColumn && editRec.userName && (
                <p className="text-sm font-medium text-muted-foreground">
                  Employee:{" "}
                  <span className="text-foreground">{editRec.userName}</span>
                </p>
              )}

              {/* Attendance Times */}
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <IconClock className="h-4 w-4" /> Attendance Times
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Check In (PKT)</Label>
                    <Input
                      type="datetime-local"
                      value={
                        editRec.check_in ? editRec.check_in.slice(0, 16) : ""
                      }
                      onChange={(e) =>
                        setEditRec({ ...editRec, check_in: e.target.value })
                      }
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Check Out (PKT)</Label>
                    <Input
                      type="datetime-local"
                      value={
                        editRec.check_out ? editRec.check_out.slice(0, 16) : ""
                      }
                      onChange={(e) =>
                        setEditRec({ ...editRec, check_out: e.target.value })
                      }
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Break Sessions */}
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <IconCoffee className="h-4 w-4" /> Break Sessions
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={addBreakSession}
                  >
                    <IconPlus className="h-3 w-3" /> Add Break
                  </Button>
                </div>

                {editBreaksAreImplied && editBreaks.length > 0 && (
                  <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-start gap-1.5">
                    <IconAlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      No break was logged for this day, but{" "}
                      <b>{Math.round(editBreaks[0].actual_minutes ?? 0)}m</b>{" "}
                      was estimated from the original check-in/out and worked
                      hours. Adjust the times below and click Save to record it
                      properly.
                    </span>
                  </div>
                )}

                {editBreaks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No break sessions recorded. Click `Add Break` to add one.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {editBreaks.map((brk, idx) => {
                      const isFriday = getPKTDayOfWeek(editRec.date) === 5;
                      const allowedBreak = isFriday
                        ? (officeConfig?.break_minutes_friday ?? 60)
                        : (officeConfig?.break_minutes_default ?? 30);
                      const graceMinutes =
                        officeConfig?.break_grace_minutes ?? 5;
                      const actualMins = brk.actual_minutes || 0;
                      const overtime = calculateBreakOvertime(
                        actualMins,
                        allowedBreak,
                        graceMinutes,
                      );

                      return (
                        <div
                          key={brk.id}
                          className="p-3 border rounded-lg bg-background space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">
                              Break #{idx + 1}
                              {editBreaksAreImplied && idx === 0 && (
                                <span className="ml-2 text-[10px] text-muted-foreground font-normal italic">
                                  (estimated)
                                </span>
                              )}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => deleteBreakSession(brk.id)}
                            >
                              <IconTrash className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Start Time</Label>
                              <Input
                                type="time"
                                value={brk.break_start || ""}
                                onChange={(e) =>
                                  updateBreakSession(
                                    brk.id,
                                    "break_start",
                                    e.target.value,
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">End Time</Label>
                              <Input
                                type="time"
                                value={brk.break_end || ""}
                                onChange={(e) =>
                                  updateBreakSession(
                                    brk.id,
                                    "break_end",
                                    e.target.value,
                                  )
                                }
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              Allowed: {allowedBreak}m + {graceMinutes}m grace
                            </span>
                            <span
                              className={`font-medium ${overtime > 0 ? "text-red-600" : "text-green-600"}`}
                            >
                              {actualMins}m{" "}
                              {overtime > 0 ? `(${overtime}m over)` : "✓"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status & Notes */}
              <div className="space-y-3">
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
                      <SelectItem value="PRESENT">Present</SelectItem>
                      <SelectItem value="HALF_DAY">Half Day</SelectItem>
                      <SelectItem value="ABSENT">Absent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Input
                    value={editRec.notes ?? ""}
                    onChange={(e) =>
                      setEditRec({ ...editRec, notes: e.target.value })
                    }
                    placeholder="Optional note…"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditRec(null);
                  setEditBreaks([]);
                  setEditBreaksAreImplied(false);
                }}
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
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
