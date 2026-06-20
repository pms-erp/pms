// app/(dashboard)/attendance/_components/attendance-stats.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  IconCalendarCheck,
  IconClockHour4,
  IconSun,
  IconAlertCircle,
  IconLoader,
} from "@tabler/icons-react";

interface Stats {
  total: number;
  present: number;
  halfDay: number;
  absent: number;
  avgHours: number;
}

interface Props {
  userId: string | null;
  refreshKey: number;
  forTeamLeader?: string; // pass teamLeaderId when showing team tab
  dateFrom?: string; // Optional: YYYY-MM-DD
  dateTo?: string; // Optional: YYYY-MM-DD
  scope?: "single" | "team" | "all"; // Controls absent-generation logic
}

export function AttendanceStats({ userId, refreshKey, forTeamLeader }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (userId) qs.set("userId", userId); // ✅ Handles null vs ID
        if (forTeamLeader) qs.set("teamLeaderId", forTeamLeader);

        const res = await fetch(`/api/attendance?${qs}`);
        const data = await res.json();
        if (!cancelled) setStats(data.stats ?? null);
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchStats();

    return () => {
      cancelled = true;
    };
  }, [userId, forTeamLeader, refreshKey]); // ✅ userId is in dependencies

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4 flex items-center justify-center h-20">
              <IconLoader className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      label: "Present",
      value: stats.present,
      icon: <IconCalendarCheck className="h-5 w-5 text-green-500" />,
      bg: "bg-green-500/10",
      sub: `of ${stats.total} records`,
    },
    {
      label: "Avg Hours",
      value: `${stats.avgHours}h`,
      icon: <IconClockHour4 className="h-5 w-5 text-blue-500" />,
      bg: "bg-blue-500/10",
      sub: "per day",
    },
    {
      label: "Half Days",
      value: stats.halfDay,
      icon: <IconSun className="h-5 w-5 text-yellow-500" />,
      bg: "bg-yellow-500/10",
      sub: "this period",
    },
    {
      label: "Absent",
      value: stats.absent,
      icon: <IconAlertCircle className="h-5 w-5 text-red-500" />,
      bg: "bg-red-500/10",
      sub: "this period",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}
            >
              {c.icon}
            </div>
            <div>
              <p className="text-xl font-bold leading-none">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              <p className="text-[10px] text-muted-foreground/60">{c.sub}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
