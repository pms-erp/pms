"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconClock,
  IconCoffee,
  IconLoader,
  IconDeviceFloppy,
  IconAlertCircle,
  IconBuildingSkyscraper,
  IconInfoCircle,
  IconCalendar,
  IconPower,
  IconGift,
} from "@tabler/icons-react";
import Link from "next/link";

interface OfficeConfig {
  id: string;
  office_start: string;
  office_end: string;
  checkin_window_minutes: number;
  checkout_window_minutes: number;
  break_start_time: string;
  break_end_time: string;
  break_start_time_friday?: string;
  break_end_time_friday?: string;
  break_minutes_default: number;
  break_minutes_friday: number;
  break_tracking_enabled: boolean;
  break_grace_minutes: number;
  beneficiary_minutes_default: number;
}

function timeDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function fmtMin(m: number) {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h}h`;
  return `${rem}m`;
}

function getCurrentMonthWorkingDays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let lastSatDate = -1;
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, month, d).getDay() === 6) {
      lastSatDate = d;
      break;
    }
  }
  let workingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow === 0) continue;
    if (dow === 6 && d === lastSatDate) continue;
    workingDays++;
  }
  return { workingDays, lastSatDate };
}

export function OfficeConfigClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Omit<OfficeConfig, "id">>({
    office_start: "09:00",
    office_end: "18:00",
    checkin_window_minutes: 60,
    checkout_window_minutes: 60,
    break_start_time: "14:00",
    break_end_time: "14:30",
    break_start_time_friday: undefined,
    break_end_time_friday: undefined,
    break_minutes_default: 30,
    break_minutes_friday: 60,
    break_tracking_enabled: true,
    break_grace_minutes: 5,
    beneficiary_minutes_default: 0,
  });

  const thisMonth = getCurrentMonthWorkingDays();
  const now = new Date();
  const thisMonthName = now.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/attendance/office-config");
        const data = await res.json();
        const cfg: OfficeConfig = data.config;
        setForm({
          office_start: cfg.office_start,
          office_end: cfg.office_end,
          checkin_window_minutes: cfg.checkin_window_minutes,
          checkout_window_minutes: cfg.checkout_window_minutes,
          break_start_time: cfg.break_start_time,
          break_end_time: cfg.break_end_time,
          break_start_time_friday: cfg.break_start_time_friday ?? undefined,
          break_end_time_friday: cfg.break_end_time_friday ?? undefined,
          break_minutes_default: cfg.break_minutes_default,
          break_minutes_friday: cfg.break_minutes_friday,
          break_tracking_enabled: cfg.break_tracking_enabled,
          break_grace_minutes: cfg.break_grace_minutes,
          beneficiary_minutes_default: cfg.beneficiary_minutes_default ?? 0,
        });
      } catch {
        toast.error("Failed to load config");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function handleBreakTimeChange(
    field: "break_start_time" | "break_end_time",
    val: string,
  ) {
    const updated = { ...form, [field]: val };
    const diff = timeDiffMinutes(
      updated.break_start_time,
      updated.break_end_time,
    );
    if (diff > 0) updated.break_minutes_default = diff;
    setForm(updated);
  }

  function handleFridayBreakTimeChange(
    field: "break_start_time_friday" | "break_end_time_friday",
    val: string,
  ) {
    const updated = { ...form, [field]: val || undefined };
    if (updated.break_start_time_friday && updated.break_end_time_friday) {
      const diff = timeDiffMinutes(
        updated.break_start_time_friday,
        updated.break_end_time_friday,
      );
      if (diff > 0) updated.break_minutes_friday = diff;
    }
    setForm(updated);
  }

  async function handleSave() {
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(form.office_start) || !timeRe.test(form.office_end)) {
      toast.error("Office times must be in HH:mm format");
      return;
    }
    if (form.office_start >= form.office_end) {
      toast.error("Office end must be after office start");
      return;
    }
    if (
      !timeRe.test(form.break_start_time) ||
      !timeRe.test(form.break_end_time)
    ) {
      toast.error("Break times must be in HH:mm format");
      return;
    }
    if (form.break_start_time >= form.break_end_time) {
      toast.error("Break end must be after break start");
      return;
    }
    if (form.break_start_time_friday && form.break_end_time_friday) {
      if (
        !timeRe.test(form.break_start_time_friday) ||
        !timeRe.test(form.break_end_time_friday)
      ) {
        toast.error("Friday break times must be in HH:mm format");
        return;
      }
      if (form.break_start_time_friday >= form.break_end_time_friday) {
        toast.error("Friday break end must be after Friday break start");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/attendance/office-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Office configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function num(val: string) {
    const n = parseInt(val);
    return isNaN(n) ? 0 : n;
  }

  const officeDuration = timeDiffMinutes(form.office_start, form.office_end);
  const breakDuration = timeDiffMinutes(
    form.break_start_time,
    form.break_end_time,
  );
  const netWorkMinutes = officeDuration - form.break_minutes_default;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <IconLoader className="h-5 w-5 animate-spin" /> Loading configuration…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 mx-auto">
      {/* <Button
        variant="destructive"
        onClick={() => {
          if (
            confirm(
              "Are you sure? This will re-calculate ALL past attendance records.",
            )
          ) {
            fetch("/api/attendance/backfill-breaks", { method: "POST" })
              .then((r) => r.json())
              .then((d) => alert(d.message))
              .catch((e) => alert("Error"));
          }
        }}
      >
        🛠️ Fix All Past Attendance Data
      </Button> */}
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/attendance/locations">
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Office Configuration
          </h1>
          <p className="text-sm text-muted-foreground">
            Set office hours, break windows, and salary buffer
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <>
              <IconLoader className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <IconDeviceFloppy className="h-4 w-4" /> Save Changes
            </>
          )}
        </Button>
      </div>
      {/* Work schedule info */}
      <div className="p-4 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-800">
        <div className="flex items-center gap-2 mb-2">
          <IconCalendar className="h-4 w-4 text-violet-500" />
          <p className="font-semibold">Office Work Schedule</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            {
              day: "Mon – Thu",
              note: "Full day, standard break",
              color: "bg-blue-100 text-blue-700",
            },
            {
              day: "Friday",
              note: "Full day, extended break (Jumu'ah)",
              color: "bg-green-100 text-green-700",
            },
            {
              day: "Saturday",
              note: "Full day (last Sat of month off)",
              color: "bg-amber-100 text-amber-700",
            },
            {
              day: "Sunday",
              note: "Always off",
              color: "bg-red-100 text-red-700",
            },
          ].map(({ day, note, color }) => (
            <div key={day} className={`rounded-lg p-2 ${color}`}>
              <p className="font-semibold">{day}</p>
              <p className="opacity-80 mt-0.5">{note}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-violet-600/70 mt-2.5">
          {thisMonthName}: <strong>{thisMonth.workingDays} working days</strong>
          {thisMonth.lastSatDate > 0 && (
            <>
              {" "}
              (last Saturday on{" "}
              {now.toLocaleDateString("en-US", { month: "short" })}{" "}
              {thisMonth.lastSatDate} is off)
            </>
          )}
        </p>
      </div>
      {/* Live summary banner */}
      <div className="p-4 bg-muted/40 border rounded-xl flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <IconBuildingSkyscraper className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Office:</span>
          <span className="font-semibold">
            {form.office_start} – {form.office_end}
          </span>
          <Badge variant="outline" className="text-xs">
            {fmtMin(officeDuration)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <IconCoffee className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Break:</span>
          <span className="font-semibold">
            {form.break_start_time} – {form.break_end_time}
          </span>
          <Badge variant="outline" className="text-xs">
            {fmtMin(breakDuration)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <IconClock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Net work:</span>
          <span className="font-bold text-green-600">
            {fmtMin(netWorkMinutes)}
          </span>
        </div>
      </div>
      {/* Office Hours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconClock className="h-4 w-4 text-blue-500" /> Office Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Office Start Time</Label>
              <Input
                type="time"
                value={form.office_start}
                onChange={(e) =>
                  setForm({ ...form, office_start: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Office End Time</Label>
              <Input
                type="time"
                value={form.office_end}
                onChange={(e) =>
                  setForm({ ...form, office_end: e.target.value })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
      {/* Reminder Windows */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconAlertCircle className="h-4 w-4 text-amber-500" /> Auto-Reminder
            Popups
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex gap-2">
            <IconInfoCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>
              When a user opens the system within the window around office
              start/end time without checking in or out, a reminder popup
              appears.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Check-in Window (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={form.checkin_window_minutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    checkin_window_minutes: num(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Show popup ±{form.checkin_window_minutes}m of{" "}
                {form.office_start}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Check-out Window (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={form.checkout_window_minutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    checkout_window_minutes: num(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Show popup ±{form.checkout_window_minutes}m of {form.office_end}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      {/* ── BENEFICIARY MINUTES — always visible, independent of break tracking ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconGift className="h-4 w-4 text-purple-500" /> Beneficiary Minutes
            Buffer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800 flex gap-2">
            <IconInfoCircle className="h-4 w-4 shrink-0 mt-0.5 text-purple-500" />
            <span>
              Monthly buffer for ALL employees. Overtime (late minutes + break
              overtime) within this limit will <strong>NOT</strong> be deducted
              from salary. This applies regardless of whether break tracking is
              on or off.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>
              Default Beneficiary Minutes (applies to all employees)
            </Label>
            <Input
              type="number"
              min={0}
              max={300}
              value={form.beneficiary_minutes_default}
              onChange={(e) =>
                setForm({
                  ...form,
                  beneficiary_minutes_default: num(e.target.value),
                })
              }
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">
              Set to 0 to disable the buffer. Maximum recommended: 120m (2
              hours).
            </p>
          </div>

          {form.beneficiary_minutes_default > 0 && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800">
              <p className="font-semibold mb-1">
                Example with {form.beneficiary_minutes_default}m buffer:
              </p>
              <ul className="space-y-0.5">
                <li>
                  • Employee late 20m →{" "}
                  <strong className="text-green-600">No deduction</strong>{" "}
                  (within buffer)
                </li>
                <li>
                  • Employee late {form.beneficiary_minutes_default + 15}m →
                  Deduct only <strong>15m</strong>
                </li>
                <li>
                  • Break OT 10m + late 5m = 15m total → if ≤{" "}
                  {form.beneficiary_minutes_default}m →{" "}
                  <strong className="text-green-600">No deduction</strong>
                </li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Break Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <IconCoffee className="h-4 w-4 text-green-500" /> Break Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Break Tracking Toggle */}
          <div className="p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  <IconPower
                    className={`h-4 w-4 ${form.break_tracking_enabled ? "text-green-600" : "text-muted-foreground"}`}
                  />
                  Enable Break Tracking
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When OFF: No break sessions, no overtime deductions.
                  Beneficiary buffer above still applies to work time
                  deductions.
                </p>
              </div>
              <Switch
                checked={form.break_tracking_enabled}
                onCheckedChange={(v) =>
                  setForm({ ...form, break_tracking_enabled: v })
                }
                className="data-[state=checked]:bg-green-600"
              />
            </div>
            {!form.break_tracking_enabled && (
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 flex items-center gap-2">
                <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                Break tracking DISABLED — break sessions and break overtime
                deductions are inactive
              </div>
            )}
          </div>

          {/* Break settings — only when tracking is enabled */}
          {form.break_tracking_enabled && (
            <>
              <Separator />

              {/* Standard break window */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-0.5">
                    Scheduled Break Window (Mon–Thu + Sat)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Changing times auto-updates the break duration below.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Break Start Time</Label>
                    <Input
                      type="time"
                      value={form.break_start_time}
                      onChange={(e) =>
                        handleBreakTimeChange(
                          "break_start_time",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Break End Time</Label>
                    <Input
                      type="time"
                      value={form.break_end_time}
                      onChange={(e) =>
                        handleBreakTimeChange("break_end_time", e.target.value)
                      }
                    />
                  </div>
                </div>
                {breakDuration > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Scheduled break duration:{" "}
                    <span className="font-semibold text-foreground">
                      {fmtMin(breakDuration)}
                    </span>
                  </p>
                )}
              </div>

              <Separator />

              {/* Friday break window */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-0.5 flex items-center gap-2">
                    <IconCalendar className="h-4 w-4 text-green-500" />
                    Friday Break Window (Optional)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Set different break times for Friday (Jumu`ah). Leave empty
                    to use the default window.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Friday Break Start</Label>
                    <Input
                      type="time"
                      value={form.break_start_time_friday ?? ""}
                      onChange={(e) =>
                        handleFridayBreakTimeChange(
                          "break_start_time_friday",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Friday Break End</Label>
                    <Input
                      type="time"
                      value={form.break_end_time_friday ?? ""}
                      onChange={(e) =>
                        handleFridayBreakTimeChange(
                          "break_end_time_friday",
                          e.target.value,
                        )
                      }
                    />
                  </div>
                </div>
                {form.break_start_time_friday && form.break_end_time_friday && (
                  <p className="text-xs text-muted-foreground">
                    Friday break duration:{" "}
                    <span className="font-semibold text-foreground">
                      {fmtMin(
                        timeDiffMinutes(
                          form.break_start_time_friday,
                          form.break_end_time_friday,
                        ),
                      )}
                    </span>
                  </p>
                )}
              </div>

              <Separator />

              {/* Break durations */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Mon–Thu + Sat Break (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={form.break_minutes_default}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        break_minutes_default: num(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Standard break allowance
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Friday Break (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={180}
                    value={form.break_minutes_friday}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        break_minutes_friday: num(e.target.value),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Extended Friday allowance (Jumu`ah)
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Grace Period (minutes)</Label>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={form.break_grace_minutes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      break_grace_minutes: num(e.target.value),
                    })
                  }
                  className="w-40"
                />
                <p className="text-xs text-muted-foreground">
                  Extra minutes before deduction. Deduction starts after{" "}
                  <span className="font-medium">
                    {form.break_minutes_default + form.break_grace_minutes}m
                  </span>{" "}
                  Mon–Sat and{" "}
                  <span className="font-medium">
                    {form.break_minutes_friday + form.break_grace_minutes}m
                  </span>{" "}
                  Fridays.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="gap-2"
        >
          {saving ? (
            <>
              <IconLoader className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <IconDeviceFloppy className="h-4 w-4" /> Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
