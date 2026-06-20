"use client";

import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconClockHour4,
  IconUsers,
  IconSettings,
  IconBuildingCog,
  IconDownload,
  IconLoader2,
  IconSearch,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react";
import { CheckInCard } from "./check-in-card";
import { AttendanceTable } from "./attendance-table";
import { AttendanceStats } from "./attendance-stats";
import { BreakButton } from "./break-button";
import { AdminAutoCheckoutButton } from "./manual-checkout";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AttendanceImportButton } from "./attendance-import-button";

interface UserOption {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  role: string;
}

interface Props {
  userId: string;
  userName: string;
  userRole: string;
  canManage: boolean;
  canSeeAll: boolean;
  canSeeTeam: boolean;
}

function currentMonthPKT(): string {
  const now = new Date();
  const pkt = now.toLocaleString("sv-SE", { timeZone: "Asia/Karachi" });
  return pkt.slice(0, 7);
}

function monthToRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export function AttendanceClient({
  userId,
  userName,
  userRole,
  canManage,
  canSeeAll,
  canSeeTeam,
}: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [activeMonth, setActiveMonth] = useState<string>(currentMonthPKT());
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { from: dateFrom, to: dateTo } = useMemo(
    () => monthToRange(activeMonth),
    [activeMonth],
  );

  const [exportLoading, setExportLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    currentMonthPKT(),
  );

  function refresh() {
    setRefreshKey((k) => k + 1);
  }

  function initials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  useEffect(() => {
    if (!canSeeAll) return;
    setUsersLoading(true);
    fetch("/api/users?active=true")
      .then((r) => r.json())
      .then((data) => setUserOptions(data.users ?? []))
      .catch((err) => console.error("Failed to load users", err))
      .finally(() => setUsersLoading(false));
  }, [canSeeAll]);

  const filteredUsers = useMemo(() => {
    if (!employeeSearch.trim()) return userOptions;
    const query = employeeSearch.toLowerCase();
    return userOptions.filter(
      (u) =>
        u.name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query),
    );
  }, [userOptions, employeeSearch]);

  async function handleExport() {
    if (exportLoading) return;
    setExportLoading(true);
    try {
      const res = await fetch(
        `/api/attendance/export?month=${encodeURIComponent(selectedMonth)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error ?? "Export failed. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_${selectedMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert("Something went wrong during export.");
    } finally {
      setExportLoading(false);
    }
  }

  const canExport = userRole === "ADMIN" || userRole === "ATTENDANCE_MANAGER";

  const selectedUser = userOptions.find((u) => u.id === selectedUserId) ?? null;

  // ── Employee dropdown (Popover-based combobox) ────────────────────────────
  const employeeDropdown = canSeeAll ? (
    <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 h-9 px-3 text-sm w-[200px] bg-transparent focus:outline-none"
          disabled={usersLoading}
        >
          {usersLoading ? (
            <IconLoader2 className="h-4 w-4 animate-spin shrink-0" />
          ) : selectedUser ? (
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarImage src={selectedUser.avatar ?? undefined} />
              <AvatarFallback className="text-[8px]">
                {initials(selectedUser.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <IconUsers className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate flex-1 text-left">
            {selectedUser ? selectedUser.name : "All Employees"}
          </span>
          <IconChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[240px] p-0"
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={false}
      >
        {/* Search */}
        <div className="p-2 border-b">
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or username…"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="max-h-[280px] overflow-y-auto">
          {/* All Employees option */}
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
            onClick={() => {
              setSelectedUserId(null);
              setEmployeeSearch("");
              setDropdownOpen(false);
            }}
          >
            <IconUsers className="h-4 w-4 shrink-0" />
            <span className="flex-1">All Employees</span>
            {selectedUserId === null && (
              <IconCheck className="h-4 w-4 text-primary shrink-0" />
            )}
          </button>

          {usersLoading ? (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <IconLoader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              {employeeSearch ? "No matches found" : "No employees"}
            </div>
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u.id}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                onClick={() => {
                  setSelectedUserId(u.id);
                  setEmployeeSearch("");
                  setDropdownOpen(false);
                }}
              >
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarImage src={u.avatar ?? undefined} />
                  <AvatarFallback className="text-[8px]">
                    {initials(u.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <span className="truncate block">{u.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    @{u.username}
                  </span>
                </div>
                {selectedUserId === u.id && (
                  <IconCheck className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  ) : null;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <IconClockHour4 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
            <p className="text-sm text-muted-foreground">
              Track work hours and attendance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {canManage && (
            <Button variant="outline" size="sm" asChild className="gap-2">
              <Link href="/attendance/locations">
                <IconSettings className="h-4 w-4" />
                <span>Manage Locations</span>
              </Link>
            </Button>
          )}

          {canManage && (
            <Button variant="outline" size="sm" asChild className="gap-2">
              <Link href="/attendance/office-config">
                <IconBuildingCog className="h-4 w-4" />
                <span>Office Config</span>
              </Link>
            </Button>
          )}

          {canExport && (
            <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg border">
              <Label className="text-xs text-muted-foreground whitespace-nowrap pl-1">
                Month:
              </Label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleExport}
                      disabled={exportLoading}
                      className="gap-2 h-8"
                    >
                      {exportLoading ? (
                        <IconLoader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <IconDownload className="h-4 w-4" />
                      )}
                      {exportLoading ? "Exporting…" : "Export Excel"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      Download{" "}
                      {new Date(selectedMonth + "-01").toLocaleString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      attendance as .xlsx
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {canExport && <AttendanceImportButton />}
        </div>
      </div>

      {/* ── Check In Card ── */}
      <CheckInCard onCheckedIn={refresh} onCheckedOut={refresh} />

      {/* ── Break Button ── */}
      <BreakButton refreshKey={refreshKey} />

      {/* ── Tabs + Employee Dropdown joined ── */}
      <Tabs defaultValue="mine">
        {/* Tab bar row: TabsList on left, employee dropdown fused on right */}
        <div className="flex items-center">
          <TabsList className={canSeeAll ? "rounded-r-none" : ""}>
            <TabsTrigger value="mine" className="gap-2">
              <IconClockHour4 className="h-4 w-4" />
              My Attendance
            </TabsTrigger>
            {canSeeTeam && !canSeeAll && (
              <TabsTrigger value="team" className="gap-2">
                <IconUsers className="h-4 w-4" />
                My Team
              </TabsTrigger>
            )}
            {canSeeAll && (
              <TabsTrigger value="all" className="gap-2">
                <IconUsers className="h-4 w-4" />
                {selectedUserId ? "Selected Employee" : "All Staff"}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Employee dropdown — fused to the right edge of TabsList */}
          {canSeeAll && (
            <div className="flex items-center h-9 border border-l-0 rounded-r-md bg-muted/30 overflow-hidden">
              {employeeDropdown}
            </div>
          )}
        </div>

        {/* My Attendance */}
        <TabsContent value="mine" className="mt-4 space-y-4">
          <AttendanceStats
            userId={userId}
            refreshKey={refreshKey}
            dateFrom={dateFrom}
            dateTo={dateTo}
            scope="single"
          />
          <AttendanceTable
            userId={userId}
            showUserColumn={false}
            canManage={canManage}
            refreshKey={refreshKey}
            externalMonth={activeMonth}
          />
        </TabsContent>

        {/* Team — Team Leader only */}
        {canSeeTeam && !canSeeAll && (
          <TabsContent value="team" className="mt-4 space-y-4">
            <AttendanceStats
              userId={null}
              refreshKey={refreshKey}
              forTeamLeader={userId}
              dateFrom={dateFrom}
              dateTo={dateTo}
              scope="team"
            />
            <AttendanceTable
              userId={null}
              showUserColumn={true}
              canManage={false}
              refreshKey={refreshKey}
              teamLeaderId={userId}
              externalMonth={activeMonth}
            />
          </TabsContent>
        )}

        {/* All Staff / Selected User — Admin + Attendance Manager */}
        {canSeeAll && (
          <div>
            <AdminAutoCheckoutButton />
            <TabsContent value="all" className="mt-4 space-y-4">
              <AttendanceStats
                userId={selectedUserId}
                refreshKey={refreshKey}
                dateFrom={dateFrom}
                dateTo={dateTo}
                scope={selectedUserId ? "single" : "all"}
              />
              <AttendanceTable
                userId={selectedUserId}
                showUserColumn={selectedUserId === null}
                canManage={canManage}
                refreshKey={refreshKey}
                externalMonth={activeMonth}
              />
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
}
