"use client";

import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/rbac";
import { useEffect, useState } from "react";
import * as React from "react";
import {
  IconChartBar,
  IconDashboard,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconSearch,
  IconSettings,
  IconUsers,
  IconUser,
  IconBell,
  IconDeviceLaptop,
  IconClockHour4,
  IconCash,
  IconTargetArrow,
  IconCreditCard,
} from "@tabler/icons-react";

import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { projectEvents } from "@/lib/events";

// --- Types ---
type SidebarProject = {
  id: string;
  name: string;
};

type NavProject = {
  name: string;
  url: string;
  icon: React.ElementType;
};

// --- Static Data ---
const data = {
  user: {
    name: "Guest",
    email: "guest@example.com",
    avatar: "/avatars/default.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: IconDashboard,
      permission: "VIEW_DASHBOARD",
    },
    {
      title: "Analytics",
      url: "/analytics",
      icon: IconChartBar,
      permission: "VIEW_ANALYTICS",
    },
    {
      title: "Projects",
      url: "/projects",
      icon: IconFolder,
      permission: "VIEW_PROJECTS",
    },
    { title: "Team", url: "/team", icon: IconUsers, permission: "VIEW_TEAM" },
    {
      title: "Users",
      url: "/users",
      icon: IconUser,
      permission: "VIEW_USERS",
    },
    {
      title: "Tasks",
      url: "/tasks",
      icon: IconListDetails,
      permission: "VIEW_TASKS",
    },
    {
      title: "Notifications",
      url: "/notifications",
      icon: IconBell,
      permission: "VIEW_TASKS",
    },
    {
      title: "Leads",
      url: "/leads",
      icon: IconTargetArrow,
      permission: "VIEW_LEADS",
    },
    {
      title: "Devices",
      url: "/devices",
      icon: IconDeviceLaptop,
      // No permission required — visible to all authenticated users
      // except ATTENDANCE_MANAGER (handled below via role guard)
    },
    {
      title: "Attendance",
      url: "/attendance",
      icon: IconClockHour4,
      // No permission guard — visible to everyone including ATTENDANCE_MANAGER
    },
    {
      title: "Payroll",
      url: "/payroll",
      icon: IconCash,
      // ATTENDANCE_MANAGER is blocked from /payroll by middleware.
    },
    {
      title: "Bills & Subscriptions",
      url: "/billing",
      icon: IconCreditCard,
      permission: "VIEW_BILLING",
    },
  ],
  navSecondary: [
    { title: "Settings", url: "#", icon: IconSettings },
    { title: "Get Help", url: "#", icon: IconHelp },
    { title: "Search", url: "#", icon: IconSearch },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession();

  const [projects, setProjects] = useState<NavProject[]>([]);
  const [allProjects, setAllProjects] = useState<NavProject[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const userRole = session?.user?.role;
  const userTeamType = session?.user?.team_type ?? null;

  // Fetch Projects — skip for ATTENDANCE_MANAGER
  useEffect(() => {
    if (!session?.user) return;
    if (userRole === "ATTENDANCE_MANAGER") return;

    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects?limit=9");
        if (!res.ok) throw new Error("Failed to fetch");

        const jsonData = await res.json();
        const rawProjects = jsonData.data ?? [];

        const formatted: NavProject[] = rawProjects.map(
          (p: SidebarProject) => ({
            name: p.name,
            url: `/projects/${p.id}`,
            icon: IconFolder,
          }),
        );

        if (formatted.length > 8) {
          setHasMore(true);
          setProjects(formatted.slice(0, 8));
          setAllProjects(formatted);
        } else {
          setHasMore(false);
          setProjects(formatted);
          setAllProjects(formatted);
        }
      } catch (err) {
        console.error("Failed to fetch projects", err);
      }
    }

    fetchProjects();

    const unsubCreate = projectEvents.onProjectCreated(() => fetchProjects());
    const unsubDelete = projectEvents.onProjectDeleted(() => fetchProjects());

    return () => {
      unsubCreate();
      unsubDelete();
    };
  }, [session, userRole]);

  const handleShowMore = async () => {
    if (showAll) {
      setProjects(allProjects.slice(0, 8));
      setShowAll(false);
    } else {
      try {
        const res = await fetch("/api/projects?limit=1000");
        if (!res.ok) throw new Error("Failed to fetch all");

        const jsonData = await res.json();
        const rawProjects = jsonData.data ?? [];

        const formatted: NavProject[] = rawProjects.map(
          (p: SidebarProject) => ({
            name: p.name,
            url: `/projects/${p.id}`,
            icon: IconFolder,
          }),
        );

        setAllProjects(formatted);
        setProjects(formatted);
        setShowAll(true);
      } catch (err) {
        console.error("Failed to fetch all projects", err);
      }
    }
  };

  // ── Filter nav items ────────────────────────────────────────────────────────
  const filteredNavMain = data.navMain.filter((item) => {
    // ATTENDANCE_MANAGER: show ONLY the Attendance link
    if (userRole === "ATTENDANCE_MANAGER") {
      return item.url === "/attendance";
    }

    // No permission required — show to all authenticated users
    if (!item.permission) return true;

    // Not yet loaded
    if (!userRole) return false;

    // Tasks / Notifications: any task-related permission suffices
    if (item.permission === "VIEW_TASKS") {
      return (
        hasPermission(userRole, "VIEW_TASKS", userTeamType) ||
        hasPermission(userRole, "VIEW_ASSIGNED_TASKS", userTeamType) ||
        hasPermission(userRole, "VIEW_QA_TASKS", userTeamType)
      );
    }

    // Leads: pass team_type so marketing team leaders are included
    if (item.permission === "VIEW_LEADS") {
      return hasPermission(userRole, "VIEW_LEADS", userTeamType);
    }

    if (item.permission === "ALL") return true;

    return hasPermission(userRole, item.permission, userTeamType);
  });
  // ──────────────────────────────────────────────────────────────────────────

  const currentUser = session?.user
    ? {
        name: session.user.name ?? "User",
        email: session.user.email ?? "",
        image: session.user.image ?? "",
      }
    : data.user;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href={"/"}>
                <img
                  src="/logo.webp"
                  alt="Taiba Digital Logo"
                  className="h-6 w-auto shrink-0 object-contain"
                />
                <span className="text-base font-semibold truncate">
                  TAIBA Digital
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={filteredNavMain} />

        {userRole !== "ATTENDANCE_MANAGER" && (
          <NavDocuments
            items={projects}
            hasMore={hasMore}
            showAll={showAll}
            onShowMore={handleShowMore}
          />
        )}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
