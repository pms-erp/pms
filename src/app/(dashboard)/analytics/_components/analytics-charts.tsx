// components/analytics-charts.tsx
"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyPoint {
  month: string; // "2025-01"
  created: number;
  approved: number;
  rework: number;
}

interface TeamPoint {
  team: string;
  total: number;
  approved: number;
  rework: number;
}

interface StatusPoint {
  status: string;
  count: number;
}

// ─── Monthly Trend Chart ──────────────────────────────────────────────────────

const trendConfig = {
  tasks: { label: "Tasks" },
  created: { label: "Created", color: "var(--primary)" },
  approved: { label: "Approved", color: "#22c55e" },
  rework: { label: "Rework", color: "#f97316" },
} satisfies ChartConfig;

const MONTH_SHORT: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

export function MonthlyTrendChart({ data }: { data: MonthlyPoint[] }) {
  const isMobile = useIsMobile();
  const [range, setRange] = React.useState("6m");

  const filtered = React.useMemo(() => {
    const months = range === "3m" ? 3 : range === "6m" ? 6 : 12;
    return data.slice(-months);
  }, [data, range]);

  const display = filtered.map((d) => ({
    ...d,
    label: MONTH_SHORT[d.month.slice(5, 7)] ?? d.month,
  }));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Monthly Task Trend</CardTitle>
        <CardDescription>
          Created vs Approved vs Rework over time
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => v && setRange(v)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="3m">3 months</ToggleGroupItem>
            <ToggleGroupItem value="6m">6 months</ToggleGroupItem>
            <ToggleGroupItem value="12m">12 months</ToggleGroupItem>
          </ToggleGroup>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger
              className="flex w-32 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="3m" className="rounded-lg">
                3 months
              </SelectItem>
              <SelectItem value="6m" className="rounded-lg">
                6 months
              </SelectItem>
              <SelectItem value="12m" className="rounded-lg">
                12 months
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {display.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No data yet
          </div>
        ) : (
          <ChartContainer
            config={trendConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart data={display}>
              <defs>
                <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-created)"
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-created)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
                <linearGradient id="fillApproved" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-approved)"
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-approved)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
                <linearGradient id="fillRework" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-rework)"
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-rework)"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Area
                dataKey="created"
                type="natural"
                fill="url(#fillCreated)"
                stroke="var(--color-created)"
                strokeWidth={2}
                name="Created"
              />
              <Area
                dataKey="approved"
                type="natural"
                fill="url(#fillApproved)"
                stroke="var(--color-approved)"
                strokeWidth={2}
                name="Approved"
              />
              <Area
                dataKey="rework"
                type="natural"
                fill="url(#fillRework)"
                stroke="var(--color-rework)"
                strokeWidth={2}
                name="Rework"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Team Performance Bar Chart ───────────────────────────────────────────────

const teamConfig = {
  total: { label: "Total", color: "var(--primary)" },
  approved: { label: "Approved", color: "#22c55e" },
  rework: { label: "Rework", color: "#f97316" },
} satisfies ChartConfig;

const TEAM_COLORS: Record<string, string> = {
  DEVELOPER: "#3b82f6",
  DESIGNER: "#ec4899",
  PROGRAMMER: "#6366f1",
};

export function TeamPerformanceChart({ data }: { data: TeamPoint[] }) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Team Performance</CardTitle>
        <CardDescription>
          Tasks created, approved, and reworked per team
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
            No team data yet
          </div>
        ) : (
          <ChartContainer
            config={teamConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <BarChart data={data} barCategoryGap="20%">
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="team"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => v.charAt(0) + v.slice(1).toLowerCase()}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Bar
                dataKey="total"
                fill="var(--color-total)"
                radius={[4, 4, 0, 0]}
                name="Total"
              />
              <Bar
                dataKey="approved"
                fill="var(--color-approved)"
                radius={[4, 4, 0, 0]}
                name="Approved"
              />
              <Bar
                dataKey="rework"
                fill="var(--color-rework)"
                radius={[4, 4, 0, 0]}
                name="Rework"
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Status Distribution Bar Chart ───────────────────────────────────────────

const STATUS_COLORS_MAP: Record<string, string> = {
  IN_PROGRESS: "#f97316",
  WAITING_FOR_QA: "#a855f7",
  APPROVED: "#22c55e",
  REWORK: "#ef4444",
};

const statusConfig = {
  count: { label: "Tasks" },
} satisfies ChartConfig;

export function StatusDistributionChart({ data }: { data: StatusPoint[] }) {
  const display = data.map((d) => ({
    ...d,
    label: d.status.replace(/_/g, " "),
    fill: STATUS_COLORS_MAP[d.status] ?? "#94a3b8",
  }));

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Status Distribution</CardTitle>
        <CardDescription>Current task breakdown by status</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {display.length === 0 ? (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No tasks yet
          </div>
        ) : (
          <ChartContainer
            config={statusConfig}
            className="aspect-auto h-[200px] w-full"
          >
            <BarChart data={display} layout="vertical" barCategoryGap="15%">
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={120}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="line" />}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Tasks">
                {display.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
