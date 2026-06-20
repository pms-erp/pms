"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { TasksHeader } from "./tasks-header";
import { TasksStats } from "./tasks-stats";
import { TasksTable } from "./tasks-table";
import { TaskStats as TaskStatsType } from "@/lib/tasks/types";
import { taskEvents } from "@/lib/events";

type Task = {
  id: string;
  title: string;
  project_id: string | null; // ← added
  projectName: string | null;
  team_type: string | null;
  priority: string | null;
  status: string | null;
  estimated_minutes: number | null;
  assignedUserName: string | null;
  assignedByUsername: string | null;
  assignedUserAvatar: string | null;
  qa_assigned_to: string | null;
  qaAssignedUserName: string | null;
  qaAssignedUserAvatar?: string | null;
  due_date?: string | null;
};

// REPLACE WITH:
interface TasksClientProps {
  initialData: {
    data: Task[];
    total: number;
    page: number;
    totalPages: number;
  };
  initialStats: TaskStatsType;
  initialParams: {
    status?: string;
    team?: string;
    priority?: string;
    search?: string;
    page?: string;
    projectViewer?: string; // ← ADD
  };
  userRole: string;
  userId: string;
}

// Minimum ms between auto-triggered refreshes (focus, events)
// User-initiated actions (filter, page change) always fire immediately
const REFRESH_THROTTLE_MS = 10_000; // 10 seconds

export function TasksClient({
  initialData,
  initialStats,
  initialParams,
  userRole,
  userId,
}: TasksClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialData?.data || []);
  const [total, setTotal] = useState<number>(initialData?.total || 0);
  const [totalPages, setTotalPages] = useState<number>(
    initialData?.totalPages || 0,
  );
  const [currentPage, setCurrentPage] = useState<number>(
    initialData?.page || 1,
  );
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState(initialParams || {});
  const [stats, setStats] = useState<TaskStatsType>(initialStats);

  // Keep latest params + page in refs so event handlers don't need them as deps
  const paramsRef = useRef(params);
  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    paramsRef.current = params;
  }, [params]);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Track last auto-refresh time to throttle focus/event-driven refreshes
  const lastAutoRefreshRef = useRef<number>(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks/stats");
      if (res.ok) setStats(await res.json());
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, []);

  const fetchTasks = useCallback(
    async (newParams: Record<string, string> = {}) => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        Object.entries(newParams).forEach(([key, value]) => {
          if (value) queryParams.set(key, value);
        });
        const res = await fetch(`/api/tasks?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch tasks");
        const data = await res.json();
        if (data.data) {
          setTasks(data.data);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 0);
          setCurrentPage(data.page || 1);
          setParams(newParams);
        }
      } catch (error) {
        console.error("Error fetching tasks:", error);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Throttled refresh — for auto-triggers only (focus, visibility, events)
  // Prevents hammering API when multiple events fire simultaneously
  const throttledRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoRefreshRef.current < REFRESH_THROTTLE_MS) return;
    lastAutoRefreshRef.current = now;
    fetchTasks({ ...paramsRef.current, page: String(currentPageRef.current) });
    fetchStats();
  }, [fetchTasks, fetchStats]);

  // ── Refetch once on mount ────────────────────────────────────────────────
  // Catches changes made on task-detail page before navigating back here
  useEffect(() => {
    fetchTasks({ ...paramsRef.current });
    fetchStats();
    lastAutoRefreshRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally once only

  // ── Refetch when tab regains focus or becomes visible ───────────────────
  // Throttled — won't fire more than once per 10s
  useEffect(() => {
    const handleFocus = () => throttledRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") throttledRefresh();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [throttledRefresh]); // stable ref — registers only once

  // ── QA assignment events from tasks-table ───────────────────────────────
  // Removed notificationEvents — it was firing on every notification
  // and causing the API flood. Task list only needs to refresh on
  // explicit assignment changes, not on every notification.
  useEffect(() => {
    const unsub = taskEvents.onTaskAssigned(() => throttledRefresh());
    return () => unsub();
  }, [throttledRefresh]);

  // ── User-initiated actions — always immediate, no throttle ───────────────

  const handleFilterChange = useCallback(
    (newParams: Record<string, string>) => {
      fetchTasks({ ...params, ...newParams, page: "1" });
    },
    [params, fetchTasks],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      fetchTasks({ ...params, page: page.toString() });
    },
    [params, fetchTasks],
  );

  // REPLACE WITH:
  const handleStatusClick = useCallback(
    (status: string | null) => {
      const newParams: Record<string, string> = { ...params, page: "1" };
      delete newParams.status;
      delete newParams.projectViewer;

      if (status === "PROJECT_VIEWER") {
        newParams.projectViewer = "true";
      } else if (status) {
        newParams.status = status;
      }
      fetchTasks(newParams);
    },
    [params, fetchTasks],
  );

  const handleTaskCreated = useCallback(() => {
    fetchTasks({ ...params, page: "1" });
    fetchStats();
  }, [params, fetchTasks, fetchStats]);

  const handleTaskDeleted = useCallback(
    (taskId: string) => {
      setTasks((prev) => prev.filter((task) => task.id !== taskId));
      setTotal((prev) => Math.max(0, prev - 1));
      fetchStats();
    },
    [fetchStats],
  );

  const handleTaskUpdated = useCallback(
    (updatedTask: Task) => {
      setTasks((prev) =>
        prev.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
      );
      fetchStats();
    },
    [fetchStats],
  );

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 w-full min-w-0">
      <TasksHeader
        params={params}
        onFilterChange={handleFilterChange}
        onTaskCreated={handleTaskCreated}
        userRole={userRole}
      />

      <TasksStats
        stats={stats}
        currentStatus={
          params.projectViewer === "true"
            ? "PROJECT_VIEWER"
            : params.status || null
        }
        onStatusClick={handleStatusClick}
        userRole={userRole}
      />

      <TasksTable
        tasks={tasks}
        total={total}
        totalPages={totalPages}
        currentPage={currentPage}
        loading={loading}
        params={params}
        userRole={userRole}
        userId={userId}
        onPageChange={handlePageChange}
        onTaskUpdated={handleTaskUpdated}
        onTaskDeleted={handleTaskDeleted}
      />
    </div>
  );
}
