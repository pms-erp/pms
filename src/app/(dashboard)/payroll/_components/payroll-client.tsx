// app/(dashboard)/payroll/_components/payroll-client.tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconCash, IconSettings, IconCalendar } from "@tabler/icons-react";
import { PayrollTable } from "./payroll-table";
import { PayrollConfig } from "./payroll-config";
import { AttendanceHistory } from "./attendance-history";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Props {
  userId: string;
  userName: string;
  isAdmin: boolean;
  isTeamLeader?: boolean;
}

function getCurrentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function getMonthOptions(): {
  value: string;
  label: string;
  isCurrent: boolean;
}[] {
  const options: { value: string; label: string; isCurrent: boolean }[] = [];
  const now = new Date();
  const currentValue = getCurrentMonthValue();

  // Show last 12 months including current
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    // Use local date parts to avoid UTC offset issues
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const label = d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    options.push({ value, label, isCurrent: value === currentValue });
  }
  return options;
}

export function PayrollClient({
  userId,
  userName,
  isAdmin,
  isTeamLeader = false,
}: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue());
  const [activeTab, setActiveTab] = useState("payroll");

  const monthOptions = getMonthOptions();
  const currentMonthValue = getCurrentMonthValue();
  const selectedOption = monthOptions.find((o) => o.value === selectedMonth);

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    if (activeTab !== "payroll") setActiveTab("payroll");
  };

  const MonthSelector = (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground whitespace-nowrap">
        Month:
      </Label>
      <div className="flex items-center gap-1.5">
        <Select value={selectedMonth} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Select month">
              <span className="flex items-center gap-2">
                <span>{selectedOption?.label}</span>
                {selectedOption?.isCurrent && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 border-green-200 font-medium"
                  >
                    Current
                  </Badge>
                )}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className="flex items-center gap-2">
                  <span>{opt.label}</span>
                  {opt.isCurrent && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 border-green-200 font-medium"
                    >
                      Current
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quick jump to current month if not already on it */}
        {selectedMonth !== currentMonthValue && (
          <button
            onClick={() => handleMonthChange(currentMonthValue)}
            className="text-xs text-primary hover:underline whitespace-nowrap"
          >
            → Current
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <IconCash className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Payroll</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Manage salaries and monthly payroll"
                : "Your salary breakdown"}
            </p>
          </div>
        </div>

        {activeTab === "payroll" && MonthSelector}
      </div>

      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="payroll" className="gap-2">
              <IconCash className="h-4 w-4" />
              Payroll Records
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2">
              <IconCalendar className="h-4 w-4" />
              Attendance History
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <IconSettings className="h-4 w-4" />
              Work Config
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payroll" className="mt-4">
            <PayrollTable
              isAdmin={isAdmin}
              userId={userId}
              selectedMonth={selectedMonth}
              refreshKey={refreshKey}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <AttendanceHistory isAdmin={isAdmin} userId={userId} />
          </TabsContent>

          <TabsContent value="config" className="mt-4">
            <PayrollConfig onConfigSaved={() => setRefreshKey((k) => k + 1)} />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="payroll" className="gap-2">
              <IconCash className="h-4 w-4" />
              My Payroll
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2">
              <IconCalendar className="h-4 w-4" />
              Attendance History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="payroll" className="mt-4">
            <PayrollTable
              isAdmin={false}
              userId={userId}
              selectedMonth={selectedMonth}
              refreshKey={refreshKey}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          <TabsContent value="attendance" className="mt-4">
            <AttendanceHistory
              isAdmin={false}
              isTeamLeader={isTeamLeader}
              userId={userId}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
