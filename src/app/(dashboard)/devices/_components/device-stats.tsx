// app/(dashboard)/devices/_components/device-stats.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  IconDeviceLaptop,
  IconCheck,
  IconUser,
  IconTool,
  IconArchive,
} from "@tabler/icons-react";

interface Props {
  stats: {
    total: number;
    available: number;
    assigned: number;
    maintenance: number;
    retired: number;
  };
  // Optional props for context display
  scope?: "all" | "team" | "mine";
}

export function DeviceStats({ stats, scope = "all" }: Props) {
  const cards = [
    {
      label: "Total Devices",
      value: stats.total,
      icon: <IconDeviceLaptop className="h-5 w-5 text-blue-500" />,
      bg: "bg-blue-500/10",
    },
    {
      label: "Available",
      value: stats.available,
      icon: <IconCheck className="h-5 w-5 text-emerald-500" />,
      bg: "bg-emerald-500/10",
    },
    {
      label: "Assigned",
      value: stats.assigned,
      icon: <IconUser className="h-5 w-5 text-amber-500" />,
      bg: "bg-amber-500/10",
    },
    {
      label: "Maintenance",
      value: stats.maintenance,
      icon: <IconTool className="h-5 w-5 text-orange-500" />,
      bg: "bg-orange-500/10",
    },
    {
      label: "Retired",
      value: stats.retired,
      icon: <IconArchive className="h-5 w-5 text-gray-500" />,
      bg: "bg-gray-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-lg ${c.bg} flex items-center justify-center shrink-0`}
            >
              {c.icon}
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
