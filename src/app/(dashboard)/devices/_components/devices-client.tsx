// app/(dashboard)/devices/_components/devices-client.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconSearch, IconDeviceLaptop } from "@tabler/icons-react";
import { DeviceStats } from "./device-stats";
import { DevicesTable } from "./devices-table";
import { CreateDeviceDialog } from "./create-device-dialog";

export interface Device {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  serial_no: string;
  status: string;
  condition: string;
  notes: string | null;
  has_keyboard: boolean;
  has_mouse: boolean;
  has_charger: boolean;
  has_extended_screen: boolean; // ADD THIS
  password: string | null;
  created_at: string;
  updated_at: string;
  assignedUserName: string | null;
  assignedUserId: string | null;
  assignedAt: string | null;
}

export interface DeviceStats {
  total: number;
  available: number;
  assigned: number;
  maintenance: number;
  retired: number;
}

interface DevicesClientProps {
  userRole: string;
  userId: string;
  canManage: boolean;
}

export function DevicesClient({
  userRole,
  userId,
  canManage,
}: DevicesClientProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDevices = useCallback(
    async (
      params: {
        search?: string;
        status?: string;
        type?: string;
        page?: number;
      } = {},
    ) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (params.search) qs.set("search", params.search);
        if (params.status && params.status !== "all")
          qs.set("status", params.status);
        if (params.type && params.type !== "all") qs.set("type", params.type);
        if (params.page) qs.set("page", String(params.page));
        qs.set("limit", "20");

        const res = await fetch(`/api/devices?${qs}`);
        const data = await res.json();
        setDevices(data.data ?? []);
        setStats(data.stats ?? null);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setPage(data.page ?? 1);
      } catch {
        /* silently ignore */
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchDevices({ search, status: statusFilter, type: typeFilter, page: 1 });
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchDevices({
        search: val,
        status: statusFilter,
        type: typeFilter,
        page: 1,
      });
    }, 400);
  }

  function handleStatusChange(val: string) {
    setStatusFilter(val);
    fetchDevices({ search, status: val, type: typeFilter, page: 1 });
  }

  function handleTypeChange(val: string) {
    setTypeFilter(val);
    fetchDevices({ search, status: statusFilter, type: val, page: 1 });
  }

  function handlePageChange(p: number) {
    fetchDevices({ search, status: statusFilter, type: typeFilter, page: p });
  }

  function handleRefresh() {
    fetchDevices({ search, status: statusFilter, type: typeFilter, page });
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <IconDeviceLaptop className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Devices</h1>
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "Manage company devices and assignments"
                : "View your assigned devices"}
            </p>
          </div>
        </div>
        {/* ✅ Only show CreateDeviceDialog to ADMIN */}
        {canManage && <CreateDeviceDialog onCreated={handleRefresh} />}
      </div>
      {/* Stats */}
      {stats && <DeviceStats stats={stats} />}
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="ASSIGNED">Assigned</SelectItem>
            <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
            <SelectItem value="RETIRED">Retired</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="LAPTOP">Laptop</SelectItem>
            <SelectItem value="DESKTOP">Desktop</SelectItem>
            <SelectItem value="PHONE">Phone</SelectItem>
            <SelectItem value="TABLET">Tablet</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search devices…"
            className="pl-9 h-9"
          />
        </div>
      </div>
      {/* Table */}
      <DevicesTable
        devices={devices}
        loading={loading}
        total={total}
        page={page}
        totalPages={totalPages}
        canManage={canManage}
        onPageChange={handlePageChange}
        onRefresh={handleRefresh}
      />
    </div>
  );
}
